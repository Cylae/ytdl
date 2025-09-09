# YouTube Downloader

A modern, lightweight web application for downloading YouTube videos in various qualities. The interface is designed with Material Design 3 principles and a glassmorphism aesthetic. The application is containerized with Docker, making it easy to deploy on services like Google Cloud Run.

## Features

- **Modern UI**: A clean, responsive interface built with SvelteKit, featuring Material Design 3 and "Liquid Glass" (glassmorphism) effects.
- **Multiple Qualities**: Download videos in various resolutions, from 360p up to 4K, in MP4 format.
- **Smart Downloads**:
    - **Synchronous**: Standard quality videos (with combined audio/video) are downloaded instantly.
    - **Asynchronous**: High-quality videos that require merging are processed in the background. The UI provides real-time status updates, and you are notified when the download is ready.
- **Ready for Deployment**: Containerized with a multi-stage Dockerfile for a lightweight, efficient production image.
- **Lightweight & Fast**: Built with a performance-focused stack (SvelteKit, Fastify) to ensure a fast user experience.

## Technology Stack

- **Frontend**: [SvelteKit](https://kit.svelte.dev/)
- **Backend**: [Node.js](https://nodejs.org/) with [Fastify](https://www.fastify.io/)
- **Video Processing**: [yt-dlp-exec](https://github.com/imput/yt-dlp-exec) (a wrapper for `yt-dlp`)
- **Styling**: Pure CSS with Material Design 3 and Glassmorphism principles.
- **Containerization**: [Docker](https://www.docker.com/)

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/get-started) installed on your machine.
- [Node.js](https://nodejs.org/en/download/) (for development setup).

### Running with Docker (Recommended)

This is the simplest way to run the application.

1.  **Build the Docker image:**
    ```bash
    docker build -t youtube-downloader .
    ```

2.  **Run the Docker container:**
    ```bash
    docker run -p 3000:3000 youtube-downloader
    ```

3.  Open your browser and navigate to `http://localhost:3000`.

### Development Setup

If you want to run the frontend and backend separately for development:

1.  **Backend Setup:**
    ```bash
    cd backend
    npm install
    npm start
    ```
    The backend server will be running on `http://localhost:3000`.

2.  **Frontend Setup:**
    In a separate terminal:
    ```bash
    cd frontend
    npm install
    npm run dev
    ```
    The SvelteKit development server will start, typically on `http://localhost:5173`. Open this URL in your browser to use the application. The frontend will automatically connect to the backend server running on port 3000.