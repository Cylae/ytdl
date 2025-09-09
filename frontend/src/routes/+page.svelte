<script>
  let url = '';
  let videoInfo = null;
  let isLoading = false;
  let errorMessage = '';
  let selectedFormat = '';
  let downloadStatus = null;

  async function getVideoInfo() {
    isLoading = true;
    errorMessage = '';
    videoInfo = null;
    downloadStatus = null;

    try {
      const res = await fetch('http://localhost:3000/video-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch video info');
      }

      videoInfo = await res.json();
      // Auto-select a default format if available
      if (videoInfo.formats && videoInfo.formats.length > 0) {
          // Prefer a format with both video and audio
          const preferredFormat = videoInfo.formats.find(f => f.has_video && f.has_audio && f.note.includes('1080')) || videoInfo.formats.find(f => f.has_video && f.has_audio);
          selectedFormat = preferredFormat ? preferredFormat.format_id : videoInfo.formats[0].format_id;
      }

    } catch (err) {
      errorMessage = err.message;
    } finally {
      isLoading = false;
    }
  }

  async function handleDownload() {
    const format = videoInfo.formats.find(f => f.format_id === selectedFormat);
    if (!format) {
      errorMessage = 'Please select a valid format.';
      return;
    }

    // Heuristic: Use async for formats without both audio and video, or resolutions > 1080p
    const useAsync = !format.has_audio || !format.has_video || (format.resolution && parseInt(format.resolution.split('x')[1]) > 1080);

    if (useAsync) {
      await handleAsyncDownload(format);
    } else {
      handleSyncDownload(format);
    }
  }

  function handleSyncDownload(format) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'http://localhost:3000/download-sync';

    const urlInput = document.createElement('input');
    urlInput.type = 'hidden';
    urlInput.name = 'url';
    urlInput.value = url;
    form.appendChild(urlInput);

    const formatInput = document.createElement('input');
    formatInput.type = 'hidden';
    formatInput.name = 'format_id';
    formatInput.value = format.format_id;
    form.appendChild(formatInput);

    const titleInput = document.createElement('input');
    titleInput.type = 'hidden';
    titleInput.name = 'title';
    titleInput.value = videoInfo.title;
    form.appendChild(titleInput);

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  }

  async function handleAsyncDownload(format) {
    downloadStatus = { message: 'Requesting download...', progress: 0 };
    try {
      const res = await fetch('http://localhost:3000/download-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          format: format.format_id,
          title: videoInfo.title,
        }),
      });

      if (!res.ok) throw new Error('Failed to start async download.');

      const { jobId } = await res.json();

      const eventSource = new EventSource(`http://localhost:3000/download-status/${jobId}`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        downloadStatus = data;

        if (data.status === 'complete' || data.status === 'failed') {
          eventSource.close();
          if(data.status === 'complete' && data.file) {
              // Create a link to download the final file
              const link = document.createElement('a');
              link.href = `http://localhost:3000${data.file}`;
              link.textContent = 'Download your file';
              // We can't click it programmatically in the same way, but we can display it
              // For a better UX, we'd replace the status message with this link.
              downloadStatus.message = `Download ready!`;
              downloadStatus.downloadLink = link.href;
          }
        }
      };

      eventSource.onerror = () => {
        errorMessage = 'Connection to server lost.';
        eventSource.close();
      };

    } catch (err) {
      errorMessage = err.message;
      downloadStatus = null;
    }
  }
</script>

<main>
  <h1>YouTube Video Downloader</h1>

  <form on:submit|preventDefault={getVideoInfo}>
    <input type="text" bind:value={url} placeholder="Enter YouTube URL" required />
    <button type="submit" disabled={isLoading}>
      {#if isLoading}Loading...{:else}Get Video Info{/if}
    </button>
  </form>

  {#if errorMessage}
    <p class="error">{errorMessage}</p>
  {/if}

  {#if videoInfo}
    <div class="video-info">
      <h2>{videoInfo.title}</h2>
      <img src={videoInfo.thumbnail} alt={videoInfo.title} />

      <div class="download-options">
        <select bind:value={selectedFormat} disabled={downloadStatus && downloadStatus.status !== 'complete' && downloadStatus.status !== 'failed'}>
          {#each videoInfo.formats as format}
            <option value={format.format_id}>
              {format.resolution || format.note} ({format.filesize_pretty})
            </option>
          {/each}
        </select>
        <button on:click={handleDownload} disabled={downloadStatus && downloadStatus.status !== 'complete' && downloadStatus.status !== 'failed'}>Download</button>
      </div>

      {#if downloadStatus}
        <div class="status">
            <p>{downloadStatus.message}</p>
            {#if downloadStatus.status === 'downloading' || downloadStatus.status === 'merging'}
                <progress value={downloadStatus.progress || 0} max="100"></progress>
            {/if}
            {#if downloadStatus.status === 'complete' && downloadStatus.downloadLink}
                <a href={downloadStatus.downloadLink} class="download-link" download>Click here to Download</a>
            {/if}
        </div>
      {/if}
    </div>
  {/if}
</main>

<style>
  :root {
    --primary-color: #4A90E2;
    --primary-text: #ffffff;
    --surface-color: rgba(255, 255, 255, 0.1);
    --surface-highlight: rgba(255, 255, 255, 0.2);
    --border-radius: 16px;
    --font-family: 'Roboto', sans-serif;
  }

  main {
    max-width: 600px;
    margin: 4rem auto;
    padding: 2rem;
    font-family: var(--font-family);

    /* Glassmorphism */
    background: var(--surface-color);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: var(--border-radius);
    border: 1px solid var(--surface-highlight);
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2);
  }

  h1 {
    text-align: center;
    color: var(--primary-text);
    font-weight: 500;
    margin-bottom: 2rem;
  }

  form {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  input[type="text"] {
    flex-grow: 1;
    padding: 1rem;
    border: 1px solid transparent;
    border-radius: var(--border-radius);
    font-size: 1rem;
    background: var(--surface-highlight);
    color: var(--primary-text);
    transition: border-color 0.3s;
  }

  input[type="text"]::placeholder {
    color: rgba(255, 255, 255, 0.7);
  }

  input[type="text"]:focus {
    outline: none;
    border-color: var(--primary-color);
  }

  button, .download-link {
    padding: 1rem 1.5rem;
    border: none;
    border-radius: var(--border-radius);
    background-color: var(--primary-color);
    color: white;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.3s, transform 0.1s;
    text-decoration: none;
    display: inline-block;
  }

  button:hover, .download-link:hover {
    background-color: #5a9ee8;
  }

  button:active, .download-link:active {
      transform: scale(0.98);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background-color: #555;
  }

  .error {
    color: #ff8a80;
    text-align: center;
    margin-bottom: 1rem;
  }

  .video-info {
    text-align: center;
    animation: fadeIn 0.5s ease-in-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .video-info h2 {
      font-weight: 400;
      color: var(--primary-text);
  }

  .video-info img {
    max-width: 100%;
    border-radius: var(--border-radius);
    margin-top: 1rem;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  }

  .download-options {
    margin-top: 1.5rem;
    display: flex;
    gap: 1rem;
    justify-content: center;
    align-items: center;
  }

  select {
    padding: 1rem;
    border-radius: var(--border-radius);
    border: none;
    background: var(--surface-highlight);
    color: var(--primary-text);
    font-size: 1rem;
  }

  .status {
      margin-top: 1.5rem;
      padding: 1rem;
      background: var(--surface-highlight);
      border-radius: var(--border-radius);
  }

  .status p {
      margin: 0 0 0.5rem 0;
      color: var(--primary-text);
  }

  progress {
      width: 100%;
      -webkit-appearance: none;
      appearance: none;
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
      border: none;
  }

  progress::-webkit-progress-bar {
      background-color: rgba(0,0,0,0.2);
  }

  progress::-webkit-progress-value {
      background-color: var(--primary-color);
      transition: width 0.3s;
  }

</style>
