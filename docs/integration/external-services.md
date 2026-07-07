# External Services

Integration with third-party services and infrastructure.

## Service Overview

```mermaid
graph TD
 subgraph Platform
 A[React Client]
 B[Express API]
 end

 subgraph External
 C[MongoDB]
 E[Kubernetes]
 F[Docker Registry]
 end

 A --> B
 B --> C
 B -->|deploy topology| E
 E --> F

 style Platform fill:#e3f2fd
 style External fill:#fff3e0
```

## MongoDB

### Connection

```typescript
// config/database.ts
import mongoose from 'mongoose';

const connectDB = async () => {
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
};
```

### Options

| Option   | Development       | Production                   |
| -------- | ----------------- | ---------------------------- |
| Host     | `localhost:27017` | MongoDB Atlas or replica set |
| Database | `intact`          | `intact_prod`                |
| Auth     | None              | Username/password            |
| SSL      | Disabled          | Enabled                      |

### Connection String Formats

```bash
# Local development
MONGODB_URI=mongodb://localhost:27017/intact

# MongoDB Atlas
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/intact?retryWrites=true

# Replica set
MONGODB_URI=mongodb://host1:27017,host2:27017,host3:27017/intact?replicaSet=rs0
```

### Health Check

```typescript
// Check MongoDB connection
app.get('/api/health', async (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ status: 'ok', database: dbStatus });
});
```

## Kubernetes Integration

### Infrastructure Types

The platform supports multiple infrastructure types:

```typescript
type InfrastructureType = 'kubernetes' | 'docker' | 'vm';

interface Infrastructure {
  name: string;
  type: InfrastructureType;
  endpoint: string;
  credentials: EncryptedCredentials;
}
```

### Kubernetes Configuration

```yaml
# Example kubeconfig structure
apiVersion: v1
kind: Config
clusters:
 - cluster:
 server: https://k8s.example.com:6443
 certificate-authority-data: <base64>
 name: production
contexts:
 - context:
 cluster: production
 user: admin
 name: production
users:
 - name: admin
 user:
 token: <service-account-token>
```

### Connection Testing

`POST /api/infrastructures/:id/test` runs a real liveness probe against the
cluster: it builds a client from the (decrypted) credentials and lists a single
namespace. A successful call means the API server answered and authorized the
request. Expected failures — unreachable endpoint, bad credentials, TLS error —
resolve to `success: false` with a descriptive message rather than a `500`.

```json
// Response
{
  "success": true,
  "status": "active",
  "lastHealthCheck": "2026-07-06T10:00:00.000Z",
  "message": "Connection successful"
}
```

The infrastructure's `status` is persisted as `active` on success or `error` on
failure. The probe uses the same client builder as scenario execution — see
[Kubernetes Execution](kubernetes-execution.md#cluster-credentials).

## Docker Registry

### Image References

Services reference Docker images for deployment:

```yaml
# In service topology
nodes:
 - id: mmt-probe
 image: registry.intact-project.eu/mmt-probe:1.2.0
```

### Registry Authentication

For private registries:

```yaml
# Kubernetes secret
apiVersion: v1
kind: Secret
metadata:
  name: registry-credentials
type: kubernetes.io/dockerconfigjson
data:
  .dockerconfigjson: <base64-encoded-config>
```

## Kafka Integration

### Message Broker

Services communicate via Kafka message broker:

```mermaid
graph LR
 A[MMT Probe] -->|publish| K[Kafka]
 K -->|subscribe| B[SIEM]
 K -->|subscribe| C[Dashboard]
```

### Topic Configuration

```yaml
# Kafka topics referenced by service topologies
kafka:
  bootstrap.servers: kafka.intact-project.eu:9092
  topics:
    - security-events
    - alerts
    - metrics
```

## Service Dependencies

### Required Services

| Service    | Purpose              | Required                |
| ---------- | -------------------- | ----------------------- |
| MongoDB    | Data storage         | Yes                     |
| Kubernetes | Deployment + runtime | For execution           |
| Kafka      | Messaging            | For inter-service comms |

### Optional Services

| Service    | Purpose    | When Needed |
| ---------- | ---------- | ----------- |
| Redis      | Caching    | High load   |
| Prometheus | Metrics    | Monitoring  |
| Grafana    | Dashboards | Monitoring  |

## Environment Configuration

### Development

```bash
# .env (development)
MONGODB_URI=mongodb://localhost:27017/intact
```

### Production

```bash
# .env.prod
MONGODB_URI=mongodb+srv://prod-user:***@cluster.mongodb.net/intact_prod
```

## Health Monitoring

### Service Health Checks

```typescript
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    database: boolean;
    infrastructure: boolean;
  };
  timestamp: Date;
}

app.get('/api/health/detailed', async (req, res) => {
  const health: HealthStatus = {
    status: 'healthy',
    services: {
      database: mongoose.connection.readyState === 1,
      infrastructure: await checkInfrastructures(),
    },
    timestamp: new Date(),
  };

  if (!Object.values(health.services).every(Boolean)) {
    health.status = 'degraded';
  }

  res.json(health);
});
```

## Security

### Credential Storage

All external service credentials are encrypted:

```typescript
// AES-256-GCM encryption
const encrypted = encrypt(credentials, ENCRYPTION_KEY);
// Stored in database as encrypted blob
```

### Network Security

```mermaid
graph TD
 subgraph Public
 A[Users]
 end

 subgraph DMZ
 B[Load Balancer]
 C[nginx]
 end

 subgraph Private
 D[Express API]
 E[MongoDB]
 F[Kubernetes]
 end

 A --> B
 B --> C
 C --> D
 D --> E
 D --> F
```

## Troubleshooting

### MongoDB Connection Issues

See [Common Issues](../troubleshooting/common-issues.md#mongodb-connection-failed)

### Kubernetes Connectivity

1. Verify kubeconfig is valid
2. Check network access to cluster
3. Verify service account permissions
4. Test with `kubectl` directly

### Scenario Execution

See [Kubernetes Execution](kubernetes-execution.md#error-handling)

## Related Documentation

- [Kubernetes Execution](kubernetes-execution.md)
- [Configuration Guide](../installation/configuration.md)
- [Deployment Playbook](../playbooks/deployment.md)
