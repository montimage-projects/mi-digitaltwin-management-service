# Deployment Guide

This guide covers deploying the INTACT Digital Twin Management Platform to production.

## Prerequisites

- Docker 24.0+ and Docker Compose 2.0+
- Domain name (optional, for HTTPS)
- Minimum 2GB RAM, 10GB disk space

## Quick Start (Docker)

1. Clone the repository:
```bash
git clone <repository-url>
cd service-repository-digitaltwin-management-platform
```

2. Create environment file:
```bash
cp .env.example .env.prod
```

3. Configure environment variables (see Environment Variables section)

4. Build and start services:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

5. Seed the database (first run only):
```bash
docker compose -f docker-compose.prod.yml exec server bun src/seed/index.ts
```

6. Access the application at `http://localhost` (or your configured domain)

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | Secret key for JWT signing (min 32 chars) | `your-super-secret-key-here-min-32-chars` |
| `ENCRYPTION_KEY` | Key for encrypting sensitive data (32 chars) | `your-32-character-encryption-key` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Port to expose the client | `80` |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost` |
| `NODE_ENV` | Environment mode | `production` |

### Generating Secure Keys

```bash
# Generate JWT_SECRET
openssl rand -base64 48

# Generate ENCRYPTION_KEY (32 characters)
openssl rand -hex 16
```

## Architecture

```
                    ┌─────────────┐
                    │   Client    │
                    │   (nginx)   │
                    │   Port 80   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            │
        ┌──────────┐  ┌──────────┐     │
        │  Static  │  │   /api   │     │
        │  Files   │  │  Proxy   │     │
        └──────────┘  └────┬─────┘     │
                           │            │
                           ▼            │
                    ┌──────────┐        │
                    │  Server  │        │
                    │ Port 3000│        │
                    └────┬─────┘        │
                         │              │
                         ▼              │
                    ┌──────────┐        │
                    │ MongoDB  │        │
                    │ Port 27017│       │
                    └──────────┘        │
```

## Health Checks

- **Client**: `GET http://localhost/health`
- **Server**: `GET http://localhost/api/health`

## Backup and Restore

### Backup MongoDB

```bash
# Create backup
docker compose -f docker-compose.prod.yml exec mongodb mongodump --db intact --out /data/db/backup

# Copy backup from container
docker cp intact-mongodb:/data/db/backup ./backup-$(date +%Y%m%d)
```

### Restore MongoDB

```bash
# Copy backup to container
docker cp ./backup-YYYYMMDD intact-mongodb:/data/db/restore

# Restore
docker compose -f docker-compose.prod.yml exec mongodb mongorestore --db intact /data/db/restore/intact
```

## Troubleshooting

### Container won't start

Check logs:
```bash
docker compose -f docker-compose.prod.yml logs -f
```

### Database connection issues

Verify MongoDB is healthy:
```bash
docker compose -f docker-compose.prod.yml exec mongodb mongosh --eval "db.adminCommand('ping')"
```

### API returns 500 errors

Check server logs:
```bash
docker compose -f docker-compose.prod.yml logs server
```

Verify environment variables:
```bash
docker compose -f docker-compose.prod.yml exec server env | grep -E 'JWT|MONGO|ENCRYPTION'
```

### Reset admin password

```bash
docker compose -f docker-compose.prod.yml exec server bun src/seed/index.ts
```
This will reset the admin user to default credentials (`admin` / `intact2025`).

## Updating

1. Pull latest changes:
```bash
git pull origin main
```

2. Rebuild and restart:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

## Scaling Considerations

For high-availability deployments:

1. **Database**: Use MongoDB replica set or managed service (MongoDB Atlas)
2. **Load Balancing**: Deploy multiple server instances behind a load balancer
3. **CDN**: Serve static assets through a CDN for better performance
4. **Monitoring**: Add Prometheus/Grafana for metrics collection

## Security Recommendations

1. Always use HTTPS in production (nginx SSL termination or reverse proxy)
2. Rotate JWT_SECRET and ENCRYPTION_KEY periodically
3. Enable MongoDB authentication for production
4. Use a firewall to restrict access to MongoDB port
5. Keep Docker images updated for security patches
