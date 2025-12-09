# Design: MVP v1.0 Implementation

## Architecture Overview

The MVP builds on Sprint 0's foundation by adding:
- Full CRUD operations for services, projects, scenarios, and infrastructures
- Split-screen topology editor (Monaco + React Flow)
- Tabbed workspace for embedded service dashboards
- Execution workflow with MAESTRO integration
- PDF report generation

## Data Models

### Project Model

```typescript
interface IProject {
  shortName: string;        // Unique identifier
  title: string;
  sector: 'Telecommunications' | 'Healthcare' | 'Transportation' | 'Nuclear' | 'Cross-Sector';
  leader: string;           // Lead organization
  involvedPartners: string[]; // Array of partner abbreviations
  description?: string;
  isComposite: boolean;     // True for cross-sector DTs
  atomicProjectIds: ObjectId[]; // References to composed projects
  createdAt: Date;
  updatedAt: Date;
}
```

### Scenario Model

```typescript
interface IScenario {
  projectId: ObjectId;      // Parent project reference
  title: string;
  description?: string;
  topology: {
    yaml: string;           // YAML source
    nodes: object[];        // React Flow nodes
    edges: object[];        // React Flow edges
  };
  infrastructureId: ObjectId;
  executions: IExecution[];
  createdAt: Date;
  updatedAt: Date;
}

interface IExecution {
  executedAt: Date;
  executedBy: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  deployedServices: {
    serviceId: ObjectId;
    dashboardUrl?: string;
  }[];
  conclusion?: {
    text: string;
    author: string;
    createdAt: Date;
  };
  maestroSessionId?: string;
}
```

### Infrastructure Model

```typescript
interface IInfrastructure {
  name: string;
  type: 'kubernetes' | 'docker' | 'virtual';
  endpoint: string;
  credentials: {
    iv: string;             // AES-256-GCM initialization vector
    encrypted: string;      // Encrypted kubeconfig/token
    authTag: string;        // Authentication tag
  };
  capacity: {
    cpu?: number;           // vCPUs
    memory?: number;        // GB
    storage?: number;       // GB
  };
  status: 'active' | 'inactive' | 'error';
  lastHealthCheck?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

## Component Architecture

### Topology Editor (Split-Screen)

```
+------------------------------------------+
|              Topology Editor             |
+-------------------+----------------------+
|   Monaco Editor   |    React Flow        |
|   (YAML Source)   |    (Visual Canvas)   |
|                   |                      |
|   version: "1.0"  |   [Node] → [Node]    |
|   services:       |      ↓               |
|     - id: mmt     |   [Node]             |
|       service...  |                      |
+-------------------+----------------------+
|        Service Selector Palette          |
+------------------------------------------+
```

- **Left Panel**: Monaco Editor with YAML syntax highlighting
- **Right Panel**: React Flow canvas with draggable service nodes
- **Bottom Panel**: Service selector with search/filter
- **Sync**: Changes in either panel update the other in real-time

### Tabbed Workspace

```
+------------------------------------------+
|  [Tab1] [Tab2] [Tab3+] [MAESTRO] [×]     |
+------------------------------------------+
|                                          |
|           Active Tab Content             |
|         (iFrame or Component)            |
|                                          |
+------------------------------------------+
```

- **Tab State**: Zustand store with array of open tabs
- **Tab Types**: iFrame (dashboards), Component (MAESTRO config)
- **Persistence**: Session-only (not localStorage)

## API Endpoints

### Services (Extended)
- `POST /api/services` - Create new service
- `PUT /api/services/:id` - Update service
- `DELETE /api/services/:id` - Soft delete service
- `POST /api/services/:id/versions` - Add new version

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create project
- `GET /api/projects/:id` - Get project with scenarios
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Scenarios
- `GET /api/projects/:projectId/scenarios` - List project scenarios
- `POST /api/projects/:projectId/scenarios` - Create scenario
- `GET /api/scenarios/:id` - Get scenario detail
- `PUT /api/scenarios/:id` - Update scenario (topology)
- `DELETE /api/scenarios/:id` - Delete scenario
- `POST /api/scenarios/:id/execute` - Trigger execution
- `POST /api/scenarios/:id/executions/:executionId/conclusion` - Add conclusion
- `GET /api/scenarios/:id/executions/:executionId/export/pdf` - Export PDF

### Infrastructures
- `GET /api/infrastructures` - List infrastructures
- `POST /api/infrastructures` - Create infrastructure (encrypts credentials)
- `PUT /api/infrastructures/:id` - Update infrastructure
- `DELETE /api/infrastructures/:id` - Delete infrastructure
- `POST /api/infrastructures/:id/test` - Test connection

## Encryption Strategy

Infrastructure credentials use AES-256-GCM:

```typescript
// Encryption
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
let encrypted = cipher.update(plaintext, 'utf8', 'hex');
encrypted += cipher.final('hex');
const authTag = cipher.getAuthTag().toString('hex');

// Storage format
{
  iv: iv.toString('hex'),
  encrypted: encrypted,
  authTag: authTag
}
```

The encryption key is derived from `ENCRYPTION_KEY` environment variable.

## PDF Report Structure

```
+------------------------------------------+
|           INTACT SCENARIO REPORT         |
|                                          |
|  Project: [Project Name]                 |
|  Scenario: [Scenario Title]              |
|  Executed: [Date] by [User]              |
+------------------------------------------+
|  TOPOLOGY                                |
|  [Services listed with connections]      |
+------------------------------------------+
|  DEPLOYED SERVICES                       |
|  - Service 1: [status]                   |
|  - Service 2: [status]                   |
+------------------------------------------+
|  CONCLUSION                              |
|  [User-entered conclusion text]          |
|                                          |
|  Author: [Name]                          |
|  Date: [Date]                            |
+------------------------------------------+
```

## State Management

### Tab Workspace Store (Zustand)

```typescript
interface TabStore {
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (tab: Tab) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
}

interface Tab {
  id: string;
  title: string;
  type: 'iframe' | 'component' | 'maestro';
  url?: string;           // For iFrame tabs
  component?: ReactNode;  // For component tabs
}
```

## Error Handling

All endpoints follow consistent error format:
```json
{
  "error": "Error message",
  "details": {} // Optional validation details
}
```

HTTP Status Codes:
- 400: Validation error
- 401: Unauthorized
- 404: Not found
- 409: Conflict (duplicate)
- 500: Server error
