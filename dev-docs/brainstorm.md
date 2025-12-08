# Technical Specification: INTACT Digital Twin Management Platform

Excellent, I now have a clear picture. Let me formalize the technical design.

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Frontend (React + Vite)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │Dashboard │ │ Service  │ │   DT     │ │  Infra   │ │ Settings │      │
│  │          │ │   Repo   │ │ Projects │ │ Manager  │ │          │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│                              │                                          │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │              Tabbed Workspace (iFrame Container)              │      │
│  │   [MAESTRO] [MMT Dashboard] [Service X] [Service Y] ...      │      │
│  └──────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ REST API
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Backend (Bun + Express)                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │   Auth   │ │ Services │ │ Projects │ │Scenarios │ │  Infra   │      │
│  │  Module  │ │  Module  │ │  Module  │ │  Module  │ │  Module  │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│                              │                                          │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │                    PDF Generation Service                     │      │
│  └──────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            MongoDB                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │  users   │ │ services │ │ projects │ │scenarios │ │  infra   │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Models (MongoDB Schemas)

### 2.1 User Collection
```javascript
{
  _id: ObjectId,
  username: String,           // unique
  passwordHash: String,       // bcrypt hashed
  role: "admin",              // fixed for now
  createdAt: Date,
  lastLogin: Date
}
```

### 2.2 Category Collection
```javascript
{
  _id: ObjectId,
  name: String,               // "Automated Threat Inspection"
  slug: String,               // "automated-threat-inspection"
  description: String,
  createdAt: Date,
  updatedAt: Date
}

// Seed data from D2.1:
// - Predictive Threat Intelligence
// - AI Attack-Defence Emulation
// - Automated Threat Inspection
// - Zero-Trust Distributed Computing
// - Twinning Agents
// - Dashboard & XAI
// - Service Repository
// - Training
// - Orchestration
// - Message Broker
```

### 2.3 Service Collection
```javascript
{
  _id: ObjectId,
  shortName: String,          // "MMT" - unique identifier
  title: String,              // "Montimage Monitoring Tool"
  categoryId: ObjectId,       // ref to Category
  provider: String,           // "MONT"
  description: String,

  // Version tracking
  currentVersion: String,     // "8.0"
  versions: [{
    version: String,          // "8.0"
    dockerImage: String,      // "registry.example.com/mont/mmt:v8.0"
    releaseNotes: String,
    releasedAt: Date,
    releasedBy: String
  }],

  // D2.1 Metadata
  type: String,               // "Software" | "Hardware" | "Software/Hardware"
  trl: {
    current: Number,          // 4-9
    expected: Number
  },
  license: String,            // "MIT", "Apache 2.0", "Proprietary"
  standards: [String],        // ["STIX", "MITRE ATT&CK"]

  // Technical specs
  inputs: [{
    name: String,
    description: String,
    format: String            // "network packets", "STIX alerts", etc.
  }],
  outputs: [{
    name: String,
    description: String,
    format: String
  }],

  // Integration info
  interactsWith: [String],    // ["MAESTRO", "Kafka", "Dashboard"]
  potentialUseCases: [String],// ["PUC1", "PUC2"]

  // Repository classification
  repositoryTable: String,    // "INTACT_TOOLBOX" | "OTHER_SERVICES"

  // Metadata
  createdAt: Date,
  updatedAt: Date,
  createdBy: String
}
```

### 2.4 Project Collection
```javascript
{
  _id: ObjectId,
  shortName: String,          // "PUC1"
  title: String,              // "Telcos Digital Twin"
  sector: String,             // "Telecommunications" | "Health" | "Transportation" | "Nuclear" | "Cross-Sector"
  leader: String,             // "THALES"
  involvedPartners: [String], // ["THALES", "MONT", "K3Y"]
  description: String,

  // For cross-sector projects
  isComposite: Boolean,
  atomicProjectIds: [ObjectId], // refs to other projects if composite

  // Scenarios stored separately, referenced here
  scenarioIds: [ObjectId],

  createdAt: Date,
  updatedAt: Date,
  createdBy: String
}
```

### 2.5 Scenario Collection
```javascript
{
  _id: ObjectId,
  projectId: ObjectId,        // ref to Project
  title: String,
  description: String,

  // Topology definition (code-based, renders to visual)
  topology: {
    format: "yaml",           // or "json"
    content: String,          // YAML/JSON string

    // Parsed structure for rendering
    services: [{
      id: String,             // unique within scenario
      serviceId: ObjectId,    // ref to Service collection
      version: String,        // which version to deploy
      config: Object          // service-specific configuration
    }],

    connections: [{
      id: String,
      from: String,           // service id
      to: String,             // service id
      label: String,          // "STIX alerts", "Kafka topic: threats"
      dataType: String        // optional metadata
    }]
  },

  // Infrastructure target
  infrastructureId: ObjectId,

  // Execution history
  executions: [{
    executedAt: Date,
    executedBy: String,
    status: String,           // "pending" | "deploying" | "running" | "completed" | "failed"
    deployedServices: [{
      serviceId: String,
      dashboardUrl: String,
      dashboardType: String,  // "web" | "cli"
    }],
    conclusion: {
      content: String,
      author: String,
      date: Date
    }
  }],

  createdAt: Date,
  updatedAt: Date
}
```

### 2.6 Infrastructure Collection
```javascript
{
  _id: ObjectId,
  name: String,               // "Production Cluster EU"
  type: String,               // "kubernetes"
  endpoint: String,           // "https://k8s.example.com"

  // Encrypted credentials
  credentials: {
    encryptedData: String,    // AES-256 encrypted
    iv: String                // initialization vector
  },

  // Capacity info
  capacity: {
    cpuCores: Number,
    memoryGB: Number,
    storageGB: Number
  },

  // Status
  status: String,             // "available" | "busy" | "offline"
  lastHealthCheck: Date,

  createdAt: Date,
  updatedAt: Date
}
```

---

## 3. Topology DSL Format

For the code-based editor, I propose a YAML format:

```yaml
# scenario-topology.yaml
version: "1.0"
name: "5G Attack Detection Scenario"
description: "DDoS attack simulation and detection flow"

services:
  - id: fuzzer
    service: "network-fuzzer"    # shortName from Service repo
    version: "latest"
    config:
      targetProtocol: "5G-NAS"
      attackType: "ddos"

  - id: mmt
    service: "MMT"
    version: "8.0"
    config:
      mode: "real-time"

  - id: threat-intel
    service: "predictive-threat-intelligence"
    version: "1.0"

  - id: maestro
    service: "MAESTRO"
    version: "latest"

# Data flow connections
connections:
  - from: fuzzer
    to: mmt
    label: "Malicious traffic"

  - from: mmt
    to: threat-intel
    label: "STIX alerts"
    via: "kafka"
    topic: "security-alerts"

  - from: threat-intel
    to: maestro
    label: "Mitigation commands"
```

The visual canvas will render this as a directed graph.

---

## 4. API Endpoints

### Authentication
```
POST   /api/auth/login          # Login, returns JWT
POST   /api/auth/logout         # Invalidate session
GET    /api/auth/me             # Get current user info
```

### Categories
```
GET    /api/categories          # List all categories
POST   /api/categories          # Create new category (admin)
PUT    /api/categories/:id      # Update category
DELETE /api/categories/:id      # Delete category
```

### Services
```
GET    /api/services                    # List all services
GET    /api/services?table=INTACT_TOOLBOX  # Filter by repository table
GET    /api/services/:id                # Get service details
GET    /api/services/:id/versions       # Get all versions
POST   /api/services                    # Create service
PUT    /api/services/:id                # Update service metadata
POST   /api/services/:id/versions       # Add new version
DELETE /api/services/:id                # Delete service
```

### Projects
```
GET    /api/projects                    # List all projects
GET    /api/projects/:id                # Get project with scenarios
POST   /api/projects                    # Create project
PUT    /api/projects/:id                # Update project
DELETE /api/projects/:id                # Delete project
```

### Scenarios
```
GET    /api/projects/:projectId/scenarios           # List scenarios
GET    /api/scenarios/:id                           # Get scenario details
POST   /api/projects/:projectId/scenarios           # Create scenario
PUT    /api/scenarios/:id                           # Update scenario
DELETE /api/scenarios/:id                           # Delete scenario

# Topology validation
POST   /api/scenarios/:id/validate-topology         # Validate YAML/JSON

# Execution
POST   /api/scenarios/:id/execute                   # Start execution
GET    /api/scenarios/:id/executions                # List executions
GET    /api/scenarios/:id/executions/:execId        # Get execution status
POST   /api/scenarios/:id/executions/:execId/conclusion  # Add conclusion

# Export
GET    /api/scenarios/:id/executions/:execId/export/pdf  # Export as PDF
```

### Infrastructure
```
GET    /api/infrastructures             # List all
GET    /api/infrastructures/:id         # Get details (credentials excluded)
POST   /api/infrastructures             # Create
PUT    /api/infrastructures/:id         # Update
DELETE /api/infrastructures/:id         # Delete
POST   /api/infrastructures/:id/test    # Test connection
```

### Analytics
```
GET    /api/analytics/scenarios         # Scenario execution history
GET    /api/analytics/scenarios/stats   # Aggregated stats
```

---

## 5. Frontend Component Structure

```
src/
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx           # Left navigation
│   │   ├── Header.tsx
│   │   ├── TabWorkspace.tsx      # Tabbed iframe container
│   │   └── MainLayout.tsx
│   │
│   ├── services/
│   │   ├── ServiceTable.tsx      # INTACT Toolbox / Other Services tables
│   │   ├── ServiceForm.tsx       # Create/Edit service
│   │   ├── ServiceVersionHistory.tsx
│   │   └── ServiceDetailModal.tsx
│   │
│   ├── projects/
│   │   ├── ProjectList.tsx
│   │   ├── ProjectForm.tsx
│   │   └── ProjectDetail.tsx
│   │
│   ├── scenarios/
│   │   ├── ScenarioList.tsx
│   │   ├── ScenarioEditor.tsx    # Main editor container
│   │   ├── TopologyCodeEditor.tsx    # Monaco/CodeMirror YAML editor
│   │   ├── TopologyCanvas.tsx        # React Flow visual editor
│   │   ├── ServiceSelector.tsx       # Pick services from repo
│   │   ├── ExecutionPanel.tsx        # Deploy & monitor
│   │   └── ConclusionForm.tsx
│   │
│   ├── infrastructure/
│   │   ├── InfraList.tsx
│   │   └── InfraForm.tsx
│   │
│   ├── analytics/
│   │   └── ScenarioHistory.tsx
│   │
│   └── common/
│       ├── DataTable.tsx         # Reusable table with shadcn
│       ├── ConfirmDialog.tsx
│       └── IFrameTab.tsx         # Wrapper for service dashboards
│
├── pages/
│   ├── Dashboard.tsx
│   ├── ServiceRepository.tsx
│   ├── DigitalTwinProjects.tsx
│   ├── ProjectEdit.tsx
│   ├── ScenarioEdit.tsx
│   ├── Infrastructure.tsx
│   ├── Analytics.tsx
│   ├── UserManagement.tsx
│   └── Settings.tsx
│
├── hooks/
│   ├── useAuth.ts
│   ├── useServices.ts
│   ├── useProjects.ts
│   └── useScenarios.ts
│
├── lib/
│   ├── api.ts                    # Axios/fetch wrapper
│   ├── topology-parser.ts        # YAML ↔ visual graph conversion
│   └── pdf-export.ts
│
└── store/
    └── workspace-tabs.ts         # Zustand store for open tabs
```

---

## 6. Key Implementation Details

### 6.1 Credential Encryption

```javascript
// lib/crypto.js
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SECRET_KEY = process.env.CREDENTIALS_SECRET_KEY; // 32 bytes

export function encryptCredentials(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    encryptedData: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

export function decryptCredentials(encrypted) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    SECRET_KEY,
    Buffer.from(encrypted.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));

  let decrypted = decipher.update(encrypted.encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

### 6.2 Tabbed Workspace State Management

```typescript
// store/workspace-tabs.ts
import { create } from 'zustand';

interface Tab {
  id: string;
  title: string;
  type: 'iframe' | 'component';
  url?: string;           // for iframe
  component?: string;     // for internal components
}

interface WorkspaceStore {
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (tab: Tab) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
}

export const useWorkspace = create<WorkspaceStore>((set) => ({
  tabs: [],
  activeTabId: null,

  openTab: (tab) => set((state) => {
    const exists = state.tabs.find(t => t.id === tab.id);
    if (exists) {
      return { activeTabId: tab.id };
    }
    return {
      tabs: [...state.tabs, tab],
      activeTabId: tab.id
    };
  }),

  closeTab: (id) => set((state) => ({
    tabs: state.tabs.filter(t => t.id !== id),
    activeTabId: state.activeTabId === id
      ? state.tabs[0]?.id || null
      : state.activeTabId
  })),

  setActiveTab: (id) => set({ activeTabId: id })
}));
```

### 6.3 Topology Parser (YAML ↔ React Flow)

```typescript
// lib/topology-parser.ts
import yaml from 'js-yaml';

interface TopologyNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { label: string; serviceId: string; version: string; config: any };
}

interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export function parseYamlToGraph(yamlContent: string): { nodes: TopologyNode[], edges: TopologyEdge[] } {
  const parsed = yaml.load(yamlContent) as any;

  // Auto-layout nodes in a grid
  const nodes = parsed.services.map((svc: any, index: number) => ({
    id: svc.id,
    type: 'serviceNode',
    position: {
      x: (index % 3) * 250 + 50,
      y: Math.floor(index / 3) * 150 + 50
    },
    data: {
      label: svc.service,
      serviceId: svc.service,
      version: svc.version,
      config: svc.config
    }
  }));

  const edges = parsed.connections.map((conn: any, index: number) => ({
    id: `edge-${index}`,
    source: conn.from,
    target: conn.to,
    label: conn.label,
    animated: true
  }));

  return { nodes, edges };
}

export function graphToYaml(nodes: TopologyNode[], edges: TopologyEdge[], metadata: any): string {
  const topology = {
    version: '1.0',
    name: metadata.name,
    description: metadata.description,
    services: nodes.map(n => ({
      id: n.id,
      service: n.data.serviceId,
      version: n.data.version,
      config: n.data.config
    })),
    connections: edges.map(e => ({
      from: e.source,
      to: e.target,
      label: e.label
    }))
  };

  return yaml.dump(topology);
}
```

---

## 7. PDF Export Implementation

Using **puppeteer** or **@react-pdf/renderer** for PDF generation:

```javascript
// Backend: routes/export.js
import PDFDocument from 'pdfkit';

export async function exportScenarioPDF(req, res) {
  const { scenarioId, executionId } = req.params;

  const scenario = await Scenario.findById(scenarioId);
  const execution = scenario.executions.id(executionId);

  const doc = new PDFDocument();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=scenario-${scenarioId}-report.pdf`);
  doc.pipe(res);

  // Header
  doc.fontSize(20).text('INTACT Scenario Execution Report', { align: 'center' });
  doc.moveDown();

  // Scenario Info
  doc.fontSize(14).text(`Scenario: ${scenario.title}`);
  doc.fontSize(12).text(`Description: ${scenario.description}`);
  doc.text(`Executed: ${execution.executedAt}`);
  doc.text(`Status: ${execution.status}`);
  doc.moveDown();

  // Deployed Services
  doc.fontSize(14).text('Deployed Services:');
  execution.deployedServices.forEach(svc => {
    doc.fontSize(10).text(`  - ${svc.serviceId}: ${svc.dashboardUrl}`);
  });
  doc.moveDown();

  // Conclusion
  if (execution.conclusion) {
    doc.fontSize(14).text('Conclusion:');
    doc.fontSize(12).text(execution.conclusion.content);
    doc.fontSize(10).text(`Author: ${execution.conclusion.author}, Date: ${execution.conclusion.date}`);
  }

  doc.end();
}
```

---

## 8. Remaining Questions

Before implementation begins, a few final clarifications:

1. **Visual Canvas Library**: I recommend **React Flow** for the topology canvas. It's mature, well-documented, and handles drag-drop + connections well. Acceptable?

2. **YAML Editor**: **Monaco Editor** (VS Code's editor) or **CodeMirror 6**? Monaco is heavier but has better YAML support out of the box.

3. **PDF Library**: **PDFKit** (server-side, simpler) or **@react-pdf/renderer** (React components, more flexible styling)?

4. **Seed Data**: Should I prepare seed data for all D2.1 services (Tables 17-37) as part of the initial implementation?

5. **MAESTRO iFrame**: Do you have a sample MAESTRO URL structure I should plan for? E.g., `https://maestro.example.com/deploy?scenario={id}`

---

## 9. Implementation Roadmap

| Phase | Scope | Duration |
|-------|-------|----------|
| **Phase 1** | Project setup, Auth, Service Repository CRUD | 1 week |
| **Phase 2** | Projects & Scenarios CRUD, basic topology editor (code-only) | 1 week |
| **Phase 3** | Visual canvas integration, split-screen editor | 1 week |
| **Phase 4** | MAESTRO integration, tabbed workspace, iFrame handling | 1 week |
| **Phase 5** | Infrastructure management, credential encryption | 3-4 days |
| **Phase 6** | Analytics, PDF export, polish | 3-4 days |

**Total: ~5-6 weeks for MVP**