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
        D[MAESTRO]
        E[Kubernetes]
        F[Docker Registry]
    end

    A --> B
    B --> C
    A -->|iFrame| D
    D --> E
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

```typescript
// Test infrastructure connection
app.post('/api/infrastructures/:id/test', async (req, res) => {
  const infra = await Infrastructure.findById(req.params.id);
  const credentials = decrypt(infra.credentials);

  try {
    // Attempt to list namespaces as connectivity test
    const k8sApi = createK8sClient(credentials);
    await k8sApi.listNamespace();

    await Infrastructure.findByIdAndUpdate(req.params.id, {
      lastTested: new Date(),
      status: 'active',
    });

    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});
```

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
# MAESTRO handles Kafka setup
kafka:
  bootstrap.servers: kafka.intact-project.eu:9092
  topics:
    - security-events
    - alerts
    - metrics
```

## Service Dependencies

### Required Services

| Service    | Purpose      | Required                |
| ---------- | ------------ | ----------------------- |
| MongoDB    | Data storage | Yes                     |
| MAESTRO    | Deployment   | For execution           |
| Kubernetes | Runtime      | For execution           |
| Kafka      | Messaging    | For inter-service comms |

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
VITE_MAESTRO_URL=https://maestro-dev.intact-project.eu
```

### Production

```bash
# .env.prod
MONGODB_URI=mongodb+srv://prod-user:***@cluster.mongodb.net/intact_prod
VITE_MAESTRO_URL=https://maestro.intact-project.eu
```

## Health Monitoring

### Service Health Checks

```typescript
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    database: boolean;
    maestro: boolean;
    infrastructure: boolean;
  };
  timestamp: Date;
}

app.get('/api/health/detailed', async (req, res) => {
  const health: HealthStatus = {
    status: 'healthy',
    services: {
      database: mongoose.connection.readyState === 1,
      maestro: await checkMAESTRO(),
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
        F[MAESTRO]
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

### MAESTRO Integration

See [MAESTRO Integration](maestro.md#troubleshooting)

## Related Documentation

- [MAESTRO Integration](maestro.md)
- [Configuration Guide](../installation/configuration.md)
- [Deployment Playbook](../playbooks/deployment.md)
