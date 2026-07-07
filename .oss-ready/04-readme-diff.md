--- README.md	2026-07-07 08:42:17.835250382 +0200
+++ .oss-ready/04-readme-draft.md	2026-07-07 08:45:36.236106679 +0200
@@ -1,4 +1,4 @@
-# MI Digital Twin Management Service
+# MI Digital Twin Management Service (title unchanged)
 
 A centralized platform for managing a comprehensive cybersecurity service repository and orchestrating Digital Twin projects across critical infrastructure. Enables security professionals to design, deploy, and evaluate cybersecurity scenarios in virtualized environments.
 
@@ -11,6 +11,74 @@
 
 A comprehensive README with badges, expanded description, reorganized sections, and cross-references to newly created OSS files.
 
+[Badges section added — CI, License, Version, Node, PRs Welcome]
+
+## Description (new — expanded 2-paragraph description)
+
+The MI Digital Twin Management Service is a full-stack web application developed by Montimage for the INTACT project. It provides a centralized catalog of 44+ cybersecurity services and tools, enabling security professionals to design Digital Twin scenarios via a drag-and-drop topology editor, deploy them directly to Kubernetes clusters, and monitor execution in real time through server-sent events (SSE).
+
+The platform supports multiple critical infrastructure sectors (Telecom, Healthcare, Transportation, Nuclear) and offers project-based organization, role-based access control, infrastructure targeting, and comprehensive analytics. Built with a modern React frontend and an Express/TypeScript API backed by MongoDB, it serves as the management plane for cybersecurity Digital Twin operations.
+
+## Key Features (moved up, expanded, cross-checked against source code)
+
+- **Service Repository** — Searchable catalog of 44+ cybersecurity services organized by category, sector, and provider with tabbed INTACT Toolbox and Critical Infrastructure Services views, version management, and TRL tracking.
+- **Digital Twin Projects** — Project-based organization across critical infrastructure sectors (Telecom, Healthcare, Transportation, Nuclear) with scenario grouping, metadata, and sector-aware analytics.
+- **Visual Topology Editor** — Drag-and-drop scenario design using React Flow with real-time YAML synchronization and Monaco-based YAML editor.
+- **Infrastructure Management** — Register and manage Kubernetes deployment targets with connection testing and status tracking. (was "planned feature" — now confirmed implemented)
+- **Kubernetes Execution** — Deploy scenario topologies directly to Kubernetes clusters with one-click teardown, live progress streaming over SSE, pod log streaming, and per-service status tracking.
+- **Comprehensive Analytics** — Dashboard with aggregate statistics, project/scenario counts, sector distribution, and service category breakdowns.
+- **User Management** — Role-based authentication with JWT, user CRUD, and password reset capabilities. (new — verified from code)
+- **PDF Export** — Export scenario designs and execution results to PDF. (new — verified from code)
+- **Configurable Branding** — Per-deployment branding profiles with customizable app name, organization, and logo. (new — verified from code)
+
+## Tech Stack (reformatted as tables, expanded with verified dependencies)
+
+### Frontend (table format — 14 technologies with purpose column)
+
+| Technology | Purpose |
+|---|---|
+| **React 18** | UI library |
+| **TypeScript** | Type-safe development |
+| **Vite** | Build tool and dev server |
+| **Tailwind CSS** | Utility-first styling |
+| **shadcn/ui + Radix** | Accessible UI components |
+| **TanStack React Query** | Server state management |
+| **Zustand** | Client state management |
+| **React Flow (xyflow)** | Topology visualization |
+| **React Router v6** | Client-side routing |
+| **react-hook-form + Zod** | Form validation |
+| **Axios** | HTTP client |
+| **Monaco Editor** | YAML code editor |
+| **Lucide React** | Icon library |
+| **jsPDF** | PDF export |
+
+### Backend (table format — 11 technologies with purpose column)
+
+| Technology | Purpose |
+|---|---|
+| **Node.js 20+** | Runtime |
+| **TypeScript** | Type-safe development |
+| **Express.js** | HTTP framework |
+| **MongoDB 7** | Document database |
+| **Mongoose** | ODM and schema validation |
+| **Zod** | Request validation |
+| **JWT + bcrypt** | Authentication |
+| **@kubernetes/client-node** | Kubernetes API integration |
+| **Helmet** | HTTP security headers |
+| **Compression** | gzip response compression |
+| **Morgan** | HTTP request logging |
+
 ## Quick Start
 
 ### Prerequisites
 
 - **Node.js** 20+ (runtime)
 - **Docker & Docker Compose** (for MongoDB)
+- **npm** (workspaces enabled) (added)
 
 ### Setup (3 steps) (restructured — seed command moved into server step)
 
 **Access:** http://localhost:5173 | **Login:** admin / intact2025  (unchanged)
 
-## Documentation Hub (removed — replaced by structured Documentation section below)
+### Docker (unified deployment) (new — added Docker quick-start commands)
 
-## Project Structure (major rewrite — .github expanded, config files trimmed, k8s added, docs simplified)
+## Usage (new — 6-step walkthrough based on actual page structure)
 
-### Key Features section (removed from mid-README — moved to top)
+## API Overview (new — 20-row table of REST endpoints extracted from source routes)
 
-### Tech Stack section (replaced with table format above)
+## Project Structure (simplified tree — removed extraneous config files, added k8s/, k3s/, combined .github subsections)
 
-### Workflows section (removed — content is in CONTRIBUTING.md and docs)
+## Documentation (new — 11-row table linking all docs/ files)
 
-### Security section (removed — referenced in docs and SECURITY.md)
+## CI/CD (new — GitHub Actions job table + GitLab CI link)
 
-### Deployment section (removed — content is in DEPLOYMENT.md and Quick Start)
+## Contributing (new — links to CONTRIBUTING.md + CODE_OF_CONDUCT.md)
 
-### Project Information section (merged into License section)
+## Related Publications (new — INTACT placeholder)
 
-### Support & Contributions (restructured with links to all new OSS files)
+## License (expanded — full Apache 2.0 callout with copyright)
 
---

- (removed)
  +## Support (restructured — links to Issues, SECURITY.md, CHANGELOG.md, docs)
