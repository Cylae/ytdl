# Stage 1: Build the SvelteKit frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: Install backend dependencies
FROM node:18-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev

# Stage 3: Final production image
FROM node:18-alpine
WORKDIR /app

# Copy backend node_modules from the backend-builder stage
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules

# Copy backend source code
COPY backend/ ./backend/

# Copy the built frontend from the frontend-builder stage
COPY --from=frontend-builder /app/frontend/build ./frontend/build

# Expose the port the app runs on
EXPOSE 3000

# Set the command to start the server
CMD ["node", "backend/server.js"]
