# Deployment Playbook

Complete guide for deploying the MI Digital Twin Management Service to production.

## Overview

This playbook covers Docker-based deployment of the full service stack. The production deployment uses a unified approach where the Express server serves both the API and the client static files, avoiding CORS issues.

| Configuration     | Containers          | Description                          |
| ----------------- | ------------------- | ------------------------------------ |
| **Production**    | 2 (app + MongoDB)   | Server serves API + client (no CORS) |
| **Atlas (Cloud)** | 1 (app only)        | Uses MongoDB Atlas for database      |
| **Development**   | 2 (MongoDB + admin) | Local dev with hot reload            |

Components served:

- React frontend (static files)
- Express API server
- MongoDB database

## Prerequisites

Before deploying, ensure you have:

- Docker 24.0+ and Docker Compose 2.0+
- Domain name (optional, for HTTPS)
- Minimum 2GB RAM, 10GB disk space
- Access to the repository

For detailed prerequisites, see [Prerequisites](../installation/prerequisites.md).

## Architecture

```mermaid
graph TD
 subgraph External
 U[Users] --> A[Express Server :3000]
 end

 subgraph Docker Network
 A --> |/api/*| API[API Routes]
 A --> |Static Files| S[Client Build]
 A --> M[(MongoDB :27017)]
 end

 style U fill:#e1f5fe
 style A fill:#e8f5e9
 style M fill:#fce4ec
```

**Key Benefits:**

- No CORS configuration needed (same origin)
- Simpler deployment (fewer containers)
- Automatic database seeding on first startup

## Step 1: Clone and Configure

```bash
# Clone the repository
git clone <repository-url>
cd service-repository-digitaltwin-management-platform

# Create production environment file from template
cp .env.example .env
```

## Step 2: Configure Environment Variables

Edit `.env` with your production values:

```bash
# Database - Local MongoDB (default for docker-compose.prod.yml)
MONGODB_URI=mongodb://mongodb:27017/intact

# Required - Generate secure keys
JWT_SECRET=<generate-with-openssl-rand-base64-48>
ENCRYPTION_KEY=<generate-with-openssl-rand-hex-16>

# Optional overrides
PORT=3000
CORS_ORIGIN=https://your-domain.com
NODE_ENV=production
```

See `.env.example` for all available configuration options.

### Generating Secure Keys

```bash
# Generate JWT_SECRET (48 bytes, base64 encoded)
openssl rand -base64 48

# Generate ENCRYPTION_KEY (32 hex characters)
openssl rand -hex 16
```

## Step 3: Build and Deploy

```bash
# Build and start containers
docker compose -f docker-compose.prod.yml up -d --build

# View logs
docker compose -f docker-compose.prod.yml logs -f
```

The application will be available at `http://localhost:3000`.

**Note:** Database seeding happens automatically on first startup. The seed includes:

- Default admin user (admin / intact2025)
- Categories and NIS2 sectors
- Sample services from INTACT Toolbox

## Step 4: Verify Deployment

```bash
# Check all containers are running
docker compose -f docker-compose.prod.yml ps

# Test health endpoints
curl http://localhost:3000/api/health # API health

# Verify MongoDB connection
docker compose -f docker-compose.prod.yml exec mongodb \
 mongosh --eval "db.adminCommand('ping')"
```

**Important**: Change the admin password immediately after first login.

## Updating the Application

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build

# Verify health after update
curl http://localhost:3000/api/health
```

## Re-seeding the Database

If you need to re-seed (e.g., after a fresh database):

```bash
# Remove the seed marker to allow re-seeding
docker compose -f docker-compose.prod.yml exec app rm /app/server/data/.seeded

# Restart the container
docker compose -f docker-compose.prod.yml restart app
```

Or manually run the seed:

```bash
docker compose -f docker-compose.prod.yml exec app bun src/seed/index.ts
```

## Backup and Restore

### Creating Backups

```bash
# Create MongoDB backup
docker compose -f docker-compose.prod.yml exec mongodb \
 mongodump --db intact --out /data/db/backup

# Copy backup from container
docker cp intact-mongodb:/data/db/backup ./backup-$(date +%Y%m%d)

# Compress for storage
tar -czvf backup-$(date +%Y%m%d).tar.gz ./backup-$(date +%Y%m%d)
```

### Restoring from Backup

```bash
# Copy backup to container
docker cp ./backup-YYYYMMDD intact-mongodb:/data/db/restore

# Restore database
docker compose -f docker-compose.prod.yml exec mongodb \
 mongorestore --db intact /data/db/restore/intact
```

## Rollback Procedure

If a deployment fails:

```bash
# Stop current containers
docker compose -f docker-compose.prod.yml down

# Checkout previous working version
git checkout <previous-commit-hash>

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build

# Restore database if needed
# (follow restore procedure above)
```

## Troubleshooting

### Container Won't Start

```bash
# Check container logs
docker compose -f docker-compose.prod.yml logs -f app

# Common issues:
# - Port conflicts: Check if port 3000 is in use
# - Memory: Ensure sufficient RAM available
# - Disk space: Check available disk space
```

### Database Connection Issues

```bash
# Verify MongoDB is healthy
docker compose -f docker-compose.prod.yml exec mongodb \
 mongosh --eval "db.adminCommand('ping')"

# Check network connectivity
docker compose -f docker-compose.prod.yml exec app \
 ping mongodb
```

### API Returns 500 Errors

```bash
# Check server logs
docker compose -f docker-compose.prod.yml logs app

# Verify environment variables
docker compose -f docker-compose.prod.yml exec app \
 env | grep -E 'JWT|MONGO|ENCRYPTION'

# Common causes:
# - Missing JWT_SECRET or ENCRYPTION_KEY
# - Invalid MongoDB connection string
# - Database not seeded
```

### Reset Admin Password

```bash
# Re-run seed script (resets to default credentials)
docker compose -f docker-compose.prod.yml exec app bun src/seed/index.ts
```

## Security Recommendations

1. **Use HTTPS**: Use a reverse proxy (nginx, Caddy) for SSL termination
2. **Rotate Secrets**: Change JWT_SECRET and ENCRYPTION_KEY periodically
3. **Enable Auth**: Enable MongoDB authentication in production
4. **Firewall**: Restrict access to MongoDB port (27017)
5. **Updates**: Keep Docker images updated for security patches
6. **Backups**: Schedule regular automated backups

## MongoDB Atlas Deployment

For cloud deployments, you can use MongoDB Atlas instead of running a local MongoDB container. This simplifies deployment to a single container and provides managed database features like automatic backups, scaling, and global distribution.

### Step 1: Create MongoDB Atlas Cluster

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and create an account
2. Create a new cluster (free tier available for development)
3. Create a database user with read/write permissions
4. Configure Network Access:

- For development: Add your IP address
- For production: Add your server's IP or use `0.0.0.0/0` (allow from anywhere) with strong credentials

### Step 2: Get Connection String

1. In Atlas dashboard, click "Connect" on your cluster
2. Choose "Connect your application"
3. Select "Node.js" driver
4. Copy the connection string (format: `mongodb+srv://...`)

The connection string format:

```
mongodb+srv://<username>:<password>@<cluster>.mongodb.net/intact?retryWrites=true&w=majority
```

### Step 3: Configure Environment

Create a `.env` file in the project root:

```bash
# MongoDB Atlas connection
MONGODB_URI=mongodb+srv://your-username:your-password@cluster0.xxxxx.mongodb.net/intact?retryWrites=true&w=majority

# Required security keys
JWT_SECRET=<generate-with-openssl-rand-base64-48>
ENCRYPTION_KEY=<generate-with-openssl-rand-hex-16>

# Optional
PORT=3000
CORS_ORIGIN=https://your-domain.com
SEED_ON_STARTUP=true
```

### Step 4: Deploy with Atlas

```bash
# Build and start (single container, no local MongoDB)
docker compose -f docker-compose.atlas.yml up -d --build

# View logs
docker compose -f docker-compose.atlas.yml logs -f
```

### Step 5: Verify Atlas Deployment

```bash
# Check container is running
docker compose -f docker-compose.atlas.yml ps

# Test health endpoint
curl http://localhost:3000/api/health

# View application logs
docker compose -f docker-compose.atlas.yml logs app
```

### Atlas-Specific Operations

**Re-seeding the database:**

```bash
# Remove seed marker
docker compose -f docker-compose.atlas.yml exec app rm /app/server/data/.seeded

# Restart to trigger re-seed
docker compose -f docker-compose.atlas.yml restart app
```

**Backup and Restore:**
MongoDB Atlas provides built-in backup features:

- Continuous backups (M10+ clusters)
- Cloud provider snapshots
- Point-in-time recovery

Access backups from the Atlas dashboard under "Backup" tab.

### Troubleshooting Atlas Connection

**Connection timeout:**

- Verify your IP is whitelisted in Atlas Network Access
- Check the connection string is correct
- Ensure the cluster is not paused (free tier clusters pause after 60 days of inactivity)

**Authentication failed:**

- Verify username and password are correct
- Check the database user has proper permissions
- Ensure special characters in password are URL-encoded

**Check connection from container:**

```bash
docker compose -f docker-compose.atlas.yml exec app \
 env | grep MONGODB_URI

# Test DNS resolution
docker compose -f docker-compose.atlas.yml exec app \
 nslookup <cluster>.mongodb.net
```

## Scaling Considerations

For high-availability deployments:

| Component     | Scaling Strategy                        |
| ------------- | --------------------------------------- |
| Database      | MongoDB replica set or MongoDB Atlas    |
| API Server    | Multiple instances behind load balancer |
| Static Assets | CDN for global distribution             |
| Monitoring    | Prometheus + Grafana for metrics        |

## Related Documentation

- [Prerequisites](../installation/prerequisites.md)
- [Configuration](../installation/configuration.md)
- [Troubleshooting](../troubleshooting/common-issues.md)
- [Development Playbook](development.md)
