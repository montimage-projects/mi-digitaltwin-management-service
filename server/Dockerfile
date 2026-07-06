# Server Dockerfile - Multi-stage build for production

# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Compile TypeScript
RUN npm run build

# Production stage
FROM node:20-slim AS production

WORKDIR /app

# Install curl for healthcheck (required in slim image)
# Create non-root user for security (Debian-based image)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs intact

# Copy dependencies and compiled output from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Copy entrypoint script and set permissions
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Create data directory for persistent state (seed marker)
RUN mkdir -p /app/data

# Set ownership (excluding entrypoint which stays root-owned but executable)
RUN chown -R intact:nodejs /app

# Switch to non-root user
USER intact

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV SEED_ON_STARTUP=false

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Use entrypoint for startup logic
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/app.js"]
