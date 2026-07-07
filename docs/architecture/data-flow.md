# Data Flow

Request/response flows and data transformation patterns in the application.

## Authentication Flow

```mermaid
sequenceDiagram
 participant U as User
 participant C as Client
 participant S as Server
 participant DB as MongoDB

 U->>C: Enter credentials
 C->>S: POST /api/auth/login
 S->>DB: Find user by username
 DB-->>S: User document
 S->>S: Verify password (bcrypt)
 S->>S: Generate JWT token
 S-->>C: { token, user }
 C->>C: Store token in Zustand
 C->>C: Store token in localStorage
 C-->>U: Redirect to dashboard
```

## Service CRUD Flow

### List Services

```mermaid
sequenceDiagram
 participant C as Client
 participant RQ as React Query
 participant API as API Client
 participant S as Server
 participant DB as MongoDB

 C->>RQ: useQuery(['services'])
 RQ->>API: getServices(filters)
 API->>S: GET /api/services?category=X
 S->>DB: Service.find().populate('categoryId')
 DB-->>S: Service documents
 S-->>API: { services: [...] }
 API-->>RQ: Parse response
 RQ-->>C: { data, isLoading }
```

### Create Service

```mermaid
sequenceDiagram
 participant C as Client
 participant RQ as React Query
 participant API as API Client
 participant S as Server
 participant V as Validator
 participant DB as MongoDB

 C->>RQ: useMutation(createService)
 C->>RQ: mutation.mutate(serviceData)
 RQ->>API: createService(data)
 API->>S: POST /api/services
 S->>V: Validate with Zod schema
 V-->>S: Validated data
 S->>DB: new Service(data).save()
 DB-->>S: Created document
 S-->>API: { service }
 API-->>RQ: Success
 RQ->>RQ: Invalidate ['services'] cache
 RQ-->>C: onSuccess callback
```

## Project & Scenario Flow

### Create Project with Scenarios

```mermaid
sequenceDiagram
 participant C as Client
 participant S as Server
 participant DB as MongoDB

 C->>S: POST /api/projects
 S->>DB: new Project(data).save()
 DB-->>S: Project created

 loop For each scenario
 C->>S: POST /api/projects/:id/scenarios
 S->>DB: new Scenario(data).save()
 DB-->>S: Scenario created
 end

 S-->>C: Project with scenarios
```

### Load Project Detail

```mermaid
sequenceDiagram
 participant C as Client
 participant S as Server
 participant DB as MongoDB

 C->>S: GET /api/projects/:id
 S->>DB: Project.findById(id)
 DB-->>S: Project document
 S->>DB: Scenario.find({ projectId: id })
 DB-->>S: Scenario documents
 S-->>C: { project, scenarios }
```

## Topology Data Flow

### Sync YAML and Canvas

```mermaid
flowchart TD
 subgraph TopologyEditor
 Y[YAML Editor]
 C[Canvas]
 end

 subgraph State
 N[nodes state]
 E[edges state]
 end

 subgraph Parse
 P1[YAML to JSON]
 P2[JSON to YAML]
 end

 Y -->|onChange| P1
 P1 --> N
 P1 --> E
 N --> C
 E --> C

 C -->|onNodesChange| N
 C -->|onEdgesChange| E
 N --> P2
 E --> P2
 P2 --> Y
```

### Save Topology

```mermaid
sequenceDiagram
 participant C as Canvas
 participant E as Editor
 participant API as API Client
 participant S as Server

 C->>E: onNodesChange/onEdgesChange
 E->>E: Convert to YAML
 E->>E: Debounce (500ms)
 E->>API: PUT /api/scenarios/:id
 API->>S: { topology: yamlString }
 S-->>API: Updated scenario
 API-->>E: Success
```

## Scenario Execution Flow

```mermaid
sequenceDiagram
 participant U as User
 participant C as Client
 participant S as Server
 participant K as Kubernetes

 U->>C: Click "Execute"
 C->>S: POST /api/scenarios/:id/execute
 S->>S: Validate scenario, resolve node images
 S->>K: Create namespace + Deployment/Service per node
 K-->>S: Created (nodePort assigned)
 S-->>C: { executionId, namespace, status, services }

 C->>S: GET .../executions/:id/events (SSE)
 loop Poll until settled
 S->>K: Read deployment status + pod logs
 K-->>S: Replicas, log lines
 S-->>C: event: progress / event: log
 end
 S-->>C: event: end

 U->>C: Click "Tear Down"
 C->>S: DELETE .../executions/:id
 S->>K: Delete namespace (cascades)
```

See [Kubernetes Execution](../integration/kubernetes-execution.md) for the full
resource model and SSE event payloads.

## Infrastructure Credential Flow

```mermaid
sequenceDiagram
 participant U as User
 participant C as Client
 participant S as Server
 participant E as Encryption
 participant DB as MongoDB

 U->>C: Enter credentials
 C->>S: POST /api/infrastructures
 S->>E: encrypt(credentials)
 E-->>S: Encrypted blob
 S->>DB: Save with encrypted creds
 DB-->>S: Saved
 S-->>C: Success (no creds in response)

 Note over C,S: Later, when testing connection

 C->>S: POST /api/infrastructures/:id/test
 S->>DB: Get infrastructure
 DB-->>S: With encrypted creds
 S->>E: decrypt(blob)
 E-->>S: Plain credentials
 S->>S: Test connection
 S-->>C: { success: true/false }
```

## Data Transformation Patterns

### API Response Format

```typescript
// Success response
{
 "data": { ... },
 "meta": {
 "total": 100,
 "page": 1,
 "limit": 20
 }
}

// Error response
{
 "error": "Error message",
 "details": [...]
}
```

### Query Parameter Mapping

| Client Filter | API Parameter    | MongoDB Query                  |
| ------------- | ---------------- | ------------------------------ |
| `category`    | `?category=id`   | `{ categoryId: id }`           |
| `search`      | `?search=term`   | `{ $text: { $search: term } }` |
| `status`      | `?status=active` | `{ status: 'active' }`         |
| `page`        | `?page=2`        | `.skip(20)`                    |
| `limit`       | `?limit=20`      | `.limit(20)`                   |

## Caching Strategy

```mermaid
flowchart TD
 subgraph ReactQuery["React Query Cache"]
 Services["['services']"]
 Projects["['projects']"]
 Scenario["['scenario', id]"]
 end

 subgraph Invalidation
 Create[Create] --> Services
 Update[Update] --> Scenario
 Delete[Delete] --> Projects
 end

 subgraph Stale["Stale Time: 5 min"]
 Services
 Projects
 Scenario
 end
```

## Related Documentation

- [Architecture Overview](overview.md)
- [Frontend Architecture](frontend.md)
- [Backend Architecture](backend.md)
