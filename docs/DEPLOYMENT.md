# Deployment Guide

Complete guide to deploying the MI Digital Twin Management Service to production environments.

## Prerequisites

Before deploying, ensure you have:

- **Docker** 20.10+ and **Docker Compose** 2.0+
- **Server infrastructure** with 2+ CPU cores and 4GB+ RAM
- **MongoDB** 7.0+ (self-hosted or MongoDB Atlas)
- **Domain name** (for HTTPS/SSL)
- **SSL certificate** (for HTTPS, optional for development)
- **Environment configuration** files prepared

## Deployment Options

Choose one based on your infrastructure:

1. **Docker Compose** - Single server with Docker (recommended for small deployments)
2. **Kubernetes** - Container orchestration for scalability
3. **MongoDB Atlas** - Managed MongoDB in the cloud

## Option 1: Docker Compose (Single Server)

### Prerequisites

```bash
# Verify Docker is installed
docker --version # 20.10+
docker-compose --version # 2.0+
```

### Step 1: Prepare Environment

Create `.env.prod` in project root:

```env
# General
NODE_ENV=production
LOG_LEVEL=info

# Backend
PORT=3000
BACKEND_URL=https://api.yourdomain.com

# Frontend
VITE_API_URL=https://api.yourdomain.com

# Database
MONGODB_URI=mongodb://mongodb:27017/intact
MONGODB_USER=intact_user
MONGODB_PASSWORD=secure_password_here

# Security
JWT_SECRET=your-very-secure-random-secret-key
CORS_ORIGIN=https://yourdomain.com

# Optional
MAESTRO_URL=https://maestro-orchestrator-url
MAESTRO_API_KEY=your-api-key
```

### Step 2: Update Docker Compose

Use `docker-compose.prod.yml`:

```bash
# Review production configuration
cat docker-compose.prod.yml

# Ensure images are built for production
docker build -t intact-client:prod ./client
docker build -t intact-server:prod ./server
```

### Step 3: Deploy Services

```bash
# Start production services
docker-compose -f docker-compose.prod.yml up -d

# Verify services are running
docker-compose ps

# Check logs
docker-compose logs -f server
docker-compose logs -f client
```

### Step 4: Configure Reverse Proxy

Use **Nginx** to route traffic and handle SSL:

**`/etc/nginx/sites-available/intact`:**

```nginx
upstream backend {
 server localhost:3000;
}

server {
 listen 80;
 server_name yourdomain.com;
 return 301 https://$server_name$request_uri;
}

server {
 listen 443 ssl http2;
 server_name yourdomain.com;

 ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
 ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

 # Security headers
 add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
 add_header X-Content-Type-Options "nosniff" always;
 add_header X-Frame-Options "SAMEORIGIN" always;

 # Frontend
 location / {
 proxy_pass http://localhost:5173;
 proxy_set_header Host $host;
 proxy_set_header X-Real-IP $remote_addr;
 proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
 proxy_set_header X-Forwarded-Proto $scheme;
 }

 # API
 location /api/ {
 proxy_pass http://backend;
 proxy_set_header Host $host;
 proxy_set_header X-Real-IP $remote_addr;
 proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
 proxy_set_header X-Forwarded-Proto $scheme;
 }
}
```

Enable and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/intact /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 5: SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot certonly --standalone -d yourdomain.com -d api.yourdomain.com

# Auto-renewal (runs twice daily)
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

### Step 6: Monitoring

```bash
# Check service health
docker-compose ps

# View logs
docker-compose logs -f

# Monitor resources
docker stats

# Database backup
docker exec intact-mongodb mongodump --out /backup/$(date +%Y%m%d)
```

## Option 2: MongoDB Atlas (Cloud Database)

Instead of self-hosted MongoDB, use MongoDB Atlas:

### Prerequisites

- MongoDB Atlas account (atlas.mongodb.com)
- Network access configured for your server IP

### Step 1: Create Atlas Cluster

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create project and cluster (M10+ recommended)
3. Configure security (IP whitelist, user credentials)
4. Get connection string: `mongodb+srv://user:pass@cluster.mongodb.net/intact`

### Step 2: Update Environment

In `.env.prod`:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/intact?retryWrites=true&w=majority
```

### Step 3: Use Docker Compose

```bash
# Use Atlas variant
docker-compose -f docker-compose.atlas.yml up -d
```

### Step 4: Seed Database

```bash
# Seed Atlas database with initial data
docker-compose exec server bun run seed
```

## Option 3: Kubernetes Deployment

For scalable, containerized deployments:

### Prerequisites

- Kubernetes cluster (EKS, GKE, AKS, or self-managed)
- kubectl configured
- Docker images pushed to registry

### Step 1: Build and Push Images

```bash
# Build images
docker build -t myregistry.azurecr.io/intact-client:latest ./client
docker build -t myregistry.azurecr.io/intact-server:latest ./server

# Push to registry
docker push myregistry.azurecr.io/intact-client:latest
docker push myregistry.azurecr.io/intact-server:latest
```

### Step 2: Create Kubernetes Manifests

**`k8s/namespace.yaml`:**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: intact
```

**`k8s/configmap.yaml`:**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: intact-config
  namespace: intact
data:
  ENVIRONMENT: production
  MONGODB_URI: mongodb+srv://user:pass@atlas.mongodb.net/intact
```

**`k8s/deployment-server.yaml`:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
 name: intact-server
 namespace: intact
spec:
 replicas: 2
 selector:
 matchLabels:
 app: intact-server
 template:
 metadata:
 labels:
 app: intact-server
 spec:
 containers:
 - name: server
 image: myregistry.azurecr.io/intact-server:latest
 ports:
 - containerPort: 3000
 envFrom:
 - configMapRef:
 name: intact-config
 resources:
 requests:
 memory: '512Mi'
 cpu: '250m'
 limits:
 memory: '1Gi'
 cpu: '500m'
```

**`k8s/service.yaml`:**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: intact-server
  namespace: intact
spec:
  selector:
  app: intact-server
  ports:
    - protocol: TCP
  port: 3000
  targetPort: 3000
  type: LoadBalancer
```

### Step 3: Deploy

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Apply configurations
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment-server.yaml
kubectl apply -f k8s/service.yaml

# Check deployment
kubectl get pods -n intact
kubectl logs -f deployment/intact-server -n intact
```

## Production Checklist

### Security

- [ ] Change JWT_SECRET to strong random value (64+ characters)
- [ ] Set CORS_ORIGIN to your domain only
- [ ] Enable SSL/HTTPS (Let's Encrypt or paid certificate)
- [ ] Configure firewall to restrict database access
- [ ] Set strong MongoDB user password
- [ ] Enable MongoDB authentication
- [ ] Configure rate limiting on API endpoints
- [ ] Review CORS and security headers

### Performance

- [ ] Enable database indexing (see schema.md)
- [ ] Configure MongoDB replica set for high availability
- [ ] Set appropriate log levels (not debug in production)
- [ ] Configure CDN for static assets
- [ ] Enable gzip compression in Nginx
- [ ] Monitor memory and CPU usage
- [ ] Set resource limits (memory, CPU) for containers

### Reliability

- [ ] Test backup and restore procedures
- [ ] Configure automated database backups
- [ ] Set up monitoring and alerting
- [ ] Configure health checks on all services
- [ ] Test failover procedures
- [ ] Document rollback procedures
- [ ] Plan disaster recovery strategy

### Maintenance

- [ ] Document deployment procedures
- [ ] Set up log aggregation (ELK, Datadog, etc.)
- [ ] Monitor disk space on MongoDB
- [ ] Schedule regular security updates
- [ ] Test and document update procedures
- [ ] Keep dependencies updated
- [ ] Maintain runbooks for common issues

## Monitoring & Maintenance

### Health Checks

```bash
# Backend health
curl https://yourdomain.com/api/health

# Database connectivity
docker-compose exec server npm run health-check
```

### Backup & Recovery

```bash
# Backup MongoDB
docker-compose exec mongodb mongodump --out /backup/$(date +%Y%m%d)

# Restore MongoDB
docker-compose exec mongodb mongorestore /backup/20240115

# Backup application data
tar -czf intact-backup-$(date +%Y%m%d).tar.gz docker-compose.prod.yml .env.prod
```

### Updating Services

```bash
# Pull latest images
docker-compose pull

# Stop and rebuild
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d

# Verify services
docker-compose ps
```

### Troubleshooting Production

**Service won't start?**

```bash
docker-compose logs service-name
docker-compose logs --tail 100 service-name
```

**High memory usage?**

```bash
docker stats
docker-compose exec server npm run memory-profiling
```

**Database connection issues?**

```bash
docker-compose exec server mongosh "mongodb://localhost:27017"
```

**API timeouts?**

```bash
# Check Nginx logs
tail -f /var/log/nginx/error.log

# Increase timeouts if needed
proxy_connect_timeout 60s;
proxy_send_timeout 60s;
proxy_read_timeout 60s;
```

## Scaling Considerations

### Horizontal Scaling

For multiple servers, consider:

1. **Load Balancer** - Nginx, HAProxy, or cloud provider
2. **Session Storage** - Redis for shared sessions (if needed)
3. **Database Replication** - MongoDB replica set
4. **Static Asset CDN** - CloudFront, CloudFlare, etc.

### Vertical Scaling

For single server:

1. Increase container resource limits
2. Increase MongoDB memory
3. Add more CPU cores
4. Increase RAM to 8GB+

## Disaster Recovery

### Backup Strategy

```bash
# Daily automated backup
0 2 * * * docker-compose exec mongodb mongodump --out /backups/$(date +\%Y\%m\%d)

# Weekly archived backup
0 3 * * 0 tar -czf /archives/intact-$(date +\%Y\%m\%d).tar.gz /backups
```

### Restore Procedure

```bash
# 1. Stop services
docker-compose down

# 2. Restore database
docker-compose exec mongodb mongorestore /backups/20240115

# 3. Start services
docker-compose up -d

# 4. Verify
docker-compose logs -f
```

## Support & Troubleshooting

- **General Issues:** See [Troubleshooting Guide](troubleshooting/common-issues.md)
- **Configuration:** See [Configuration Guide](installation/configuration.md)
- **Architecture:** See [Architecture Overview](architecture/overview.md)
- **Database:** See [Database Schema](database/schema.md)

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [MongoDB Atlas Docs](https://docs.atlas.mongodb.com/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Let's Encrypt](https://letsencrypt.org/)
