# Client Dockerfile - Multi-stage build for production
# Used by docker-compose.prod.yml (nginx-based deployment)

# Build stage
FROM docker.io/library/node:22-bookworm-slim AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage - unprivileged nginx for static file serving
FROM docker.io/nginxinc/nginx-unprivileged:1.31.2-alpine3.23-slim AS production

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Vite writes assets to ../server/public (configured in vite.config.ts)
COPY --from=builder --chown=nginx:nginx /server/public /usr/share/nginx/html

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Expose port
EXPOSE 8080

USER nginx

CMD ["nginx", "-g", "daemon off;"]
