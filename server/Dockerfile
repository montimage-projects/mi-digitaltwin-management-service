# Server Dockerfile - Multi-stage build for production

# Build stage
FROM node:22-bookworm-slim AS builder

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

# Trim dev dependencies from the production image.
RUN npm prune --omit=dev && npm cache clean --force

# Production stage
FROM gcr.io/distroless/nodejs22-debian13:nonroot AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV SEED_ON_STARTUP=false

# Copy dependencies and compiled output from builder
COPY --from=builder --chown=nonroot:nonroot /app/node_modules ./node_modules
COPY --from=builder --chown=nonroot:nonroot /app/dist ./dist
COPY --from=builder --chown=nonroot:nonroot /app/package.json ./

# Run as non-root user
USER nonroot

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["dist/bootstrap.js"]
