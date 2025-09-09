const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// In-memory store for download jobs and connections
const jobs = {};
const clients = {}; // To store SSE connections
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR);
}

const staticPlugin = require('@fastify/static');

// Register CORS plugin
fastify.register(cors, {
  origin: '*', // For development, allow all origins. In production, you'd restrict this.
});

// Serve the SvelteKit frontend
fastify.register(staticPlugin, {
  root: path.join(__dirname, '..', 'frontend', 'build'),
  prefix: '/',
});

fastify.setNotFoundHandler(function (request, reply) {
    reply.sendFile('index.html')
})

const ytDlp = require('yt-dlp-exec');

// Declare a route
fastify.get('/', async (request, reply) => {
  return { hello: 'world' };
});

fastify.post('/video-info', async (request, reply) => {
  const { url } = request.body;
  if (!url) {
    reply.code(400).send({ error: 'URL is required' });
    return;
  }

  try {
    const metadata = await ytDlp(url, {
      dumpJson: true,
      noWarnings: true,
    });

    const formats = metadata.formats.filter(f => f.ext === 'mp4' && (f.vcodec !== 'none' || f.acodec !== 'none')).map(f => ({
        format_id: f.format_id,
        resolution: f.resolution,
        fps: f.fps,
        has_video: f.vcodec !== 'none',
        has_audio: f.acodec !== 'none',
        filesize: f.filesize,
        filesize_pretty: f.filesize ? (f.filesize / 1024 / 1024).toFixed(2) + ' MB' : 'N/A',
        note: f.format_note,
        url: f.url // The direct download URL
    }));


    const response = {
      title: metadata.title,
      thumbnail: metadata.thumbnail,
      formats: formats,
    };

    reply.send(response);
  } catch (error) {
    fastify.log.error(error);
    reply.code(500).send({ error: 'Failed to fetch video information' });
  }
});

fastify.post('/download-sync', async (request, reply) => {
    const { url, format_id, title } = request.body;
    if (!url || !format_id) {
        reply.code(400).send({ error: 'URL and format_id are required' });
        return;
    }

    try {
        const sanitizedTitle = (title || 'video').replace(/[^a-z0-9_.-]/gi, '_');
        reply.header('Content-Disposition', `attachment; filename="${sanitizedTitle}.mp4"`);
        reply.header('Content-Type', 'video/mp4');

        const stream = ytDlp.exec(url, {
            format: format_id,
            output: '-', // Output to stdout
        });

        reply.send(stream.stdout);

    } catch (error) {
        fastify.log.error(error);
        reply.code(500).send({ error: 'Failed to download video' });
    }
});

function sendUpdate(jobId, data) {
    if (clients[jobId]) {
        clients[jobId].forEach(client => {
            client.raw.write(`data: ${JSON.stringify(data)}\n\n`);
        });
    }
}

fastify.post('/download-async', async (request, reply) => {
    const { url, format, title } = request.body;
    if (!url || !format) {
        return reply.code(400).send({ error: 'URL and format are required' });
    }

    const jobId = crypto.randomBytes(16).toString('hex');
    const sanitizedTitle = (title || 'video').replace(/[^a-z0-9_.-]/gi, '_');
    const outputPath = path.join(DOWNLOAD_DIR, `${jobId}_${sanitizedTitle}.mp4`);

    jobs[jobId] = {
        status: 'starting',
        progress: 0,
        outputPath: outputPath,
        title: sanitizedTitle,
    };

    reply.send({ jobId });

    // Start the download in the background
    (async () => {
        try {
            jobs[jobId].status = 'downloading';
            sendUpdate(jobId, { status: 'downloading', progress: 0, message: 'Starting download...' });

            const dl = ytDlp.exec(url, {
                format: format,
                output: outputPath,
                // Optional: Add progress hooks if yt-dlp-exec supports them
                // or parse stdout for progress. For simplicity, we'll just show stages.
            });

            // For now, we will not parse the output but just wait for it to be done
            await dl;

            jobs[jobId].status = 'merging';
            sendUpdate(jobId, { status: 'merging', progress: 50, message: 'Merging formats...' });

            // yt-dlp handles merging automatically when format is e.g. 'bestvideo+bestaudio/best'
            // So we just need to wait for the process to complete.

            jobs[jobId].status = 'complete';
            jobs[jobId].progress = 100;
            sendUpdate(jobId, { status: 'complete', progress: 100, message: 'Download complete!', file: `/download-file/${jobId}` });

        } catch (err) {
            console.error(`Job ${jobId} failed:`, err);
            jobs[jobId].status = 'failed';
            sendUpdate(jobId, { status: 'failed', message: 'An error occurred during download.' });
        }
    })();
});

fastify.get('/download-status/:id', (request, reply) => {
    const { id } = request.params;

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');

    if (!clients[id]) {
        clients[id] = [];
    }
    clients[id].push(reply);

    // Send current status immediately
    if (jobs[id]) {
      sendUpdate(id, { status: jobs[id].status, progress: jobs[id].progress, message: `Reconnected. Current status: ${jobs[id].status}` });
    }


    request.raw.on('close', () => {
        clients[id] = clients[id].filter(client => client !== reply);
        if (clients[id].length === 0) {
            delete clients[id];
        }
    });
});

fastify.get('/download-file/:id', (request, reply) => {
    const { id } = request.params;
    const job = jobs[id];

    if (!job || job.status !== 'complete') {
        return reply.code(404).send({ error: 'File not ready or not found.' });
    }

    const stream = fs.createReadStream(job.outputPath);
    reply.header('Content-Disposition', `attachment; filename="${job.title}.mp4"`);
    reply.type('video/mp4').send(stream);
});


// Run the server!
const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
    fastify.log.info(`server listening on ${fastify.server.address().port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
