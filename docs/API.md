# API Reference

Complete REST API reference for the MI Digital Twin Management Service.

## Base URL

```
Development: http://localhost:3000
Production: https://api.yourdomain.com
```

## Authentication

All endpoints (except `/api/auth/login`) require JWT authentication:

```
Authorization: Bearer <token>
```

### Obtaining a Token

**POST** `/api/auth/login`

Request:

```json
{
  "username": "admin",
  "password": "<ADMIN_PASSWORD>"
}
```

Response:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user123",
    "username": "admin",
    "email": "admin@intact.local"
  }
}
```

**Token Expiry:** 24 hours

## Response Format

### Success Response

```json
{
 "data": { ... },
 "meta": {
 "total": 100,
 "page": 1,
 "limit": 20
 }
}
```

### Error Response

```json
{
  "error": "Error message",
  "details": ["Field error 1", "Field error 2"],
  "statusCode": 400
}
```

## API Endpoints

### Authentication

#### Login

- **POST** `/api/auth/login`
- **Auth:** None
- **Body:** `{ username: string, password: string }`
- **Response:** `{ token: string, user: User }`

```bash
curl -X POST http://localhost:3000/api/auth/login \
 -H "Content-Type: application/json" \
 -d '{"username":"admin","password":"<ADMIN_PASSWORD>"}'
```

#### Get Current User

- **GET** `/api/auth/me`
- **Auth:** Required
- **Response:** `{ user: User }`

```bash
curl -X GET http://localhost:3000/api/auth/me \
 -H "Authorization: Bearer $TOKEN"
```

#### Logout

- **POST** `/api/auth/logout`
- **Auth:** Required
- **Response:** `{ message: "Logged out" }`

```bash
curl -X POST http://localhost:3000/api/auth/logout \
 -H "Authorization: Bearer $TOKEN"
```

### Health Check

#### Application Health

- **GET** `/api/health`
- **Auth:** None
- **Response:** `{ status: "ok", timestamp: string }`

```bash
curl http://localhost:3000/api/health
```

### Services

#### List Services

- **GET** `/api/services`
- **Auth:** Required
- **Query Parameters:**
- `category` (string, optional) - Filter by category ID
- `search` (string, optional) - Full-text search
- `page` (number, default: 1) - Page number
- `limit` (number, default: 20) - Items per page
- **Response:** `{ services: Service[], meta: Pagination }`

```bash
curl -X GET "http://localhost:3000/api/services?category=cat1&page=1&limit=20" \
 -H "Authorization: Bearer $TOKEN"
```

#### Get Service

- **GET** `/api/services/:id`
- **Auth:** Required
- **Response:** `{ service: Service }`

```bash
curl -X GET http://localhost:3000/api/services/service123 \
 -H "Authorization: Bearer $TOKEN"
```

#### Create Service

- **POST** `/api/services`
- **Auth:** Required
- **Body:** `{ name: string, description: string, categoryId: string, ... }`
- **Response:** `{ service: Service }`

```bash
curl -X POST http://localhost:3000/api/services \
 -H "Authorization: Bearer $TOKEN" \
 -H "Content-Type: application/json" \
 -d '{
 "name": "Service Name",
 "description": "Service description",
 "categoryId": "cat1"
 }'
```

#### Update Service

- **PUT** `/api/services/:id`
- **Auth:** Required
- **Body:** `{ name?: string, description?: string, ... }`
- **Response:** `{ service: Service }`

```bash
curl -X PUT http://localhost:3000/api/services/service123 \
 -H "Authorization: Bearer $TOKEN" \
 -H "Content-Type: application/json" \
 -d '{"name": "Updated Name"}'
```

#### Delete Service

- **DELETE** `/api/services/:id`
- **Auth:** Required
- **Response:** `{ message: "Service deleted" }`

```bash
curl -X DELETE http://localhost:3000/api/services/service123 \
 -H "Authorization: Bearer $TOKEN"
```

### Projects

#### List Projects

- **GET** `/api/projects`
- **Auth:** Required
- **Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20)
- **Response:** `{ projects: Project[], meta: Pagination }`

```bash
curl -X GET "http://localhost:3000/api/projects?page=1&limit=20" \
 -H "Authorization: Bearer $TOKEN"
```

#### Get Project

- **GET** `/api/projects/:id`
- **Auth:** Required
- **Response:** `{ project: Project, scenarios: Scenario[] }`

```bash
curl -X GET http://localhost:3000/api/projects/proj123 \
 -H "Authorization: Bearer $TOKEN"
```

#### Create Project

- **POST** `/api/projects`
- **Auth:** Required
- **Body:** `{ name: string, description: string, sector: string, ... }`
- **Response:** `{ project: Project }`

```bash
curl -X POST http://localhost:3000/api/projects \
 -H "Authorization: Bearer $TOKEN" \
 -H "Content-Type: application/json" \
 -d '{
 "name": "Project Name",
 "description": "Project description",
 "sector": "Telecommunications"
 }'
```

#### Update Project

- **PUT** `/api/projects/:id`
- **Auth:** Required
- **Body:** `{ name?: string, description?: string, ... }`
- **Response:** `{ project: Project }`

```bash
curl -X PUT http://localhost:3000/api/projects/proj123 \
 -H "Authorization: Bearer $TOKEN" \
 -H "Content-Type: application/json" \
 -d '{"name": "Updated Name"}'
```

#### Delete Project

- **DELETE** `/api/projects/:id`
- **Auth:** Required
- **Response:** `{ message: "Project deleted" }`

```bash
curl -X DELETE http://localhost:3000/api/projects/proj123 \
 -H "Authorization: Bearer $TOKEN"
```

### Scenarios

#### List Scenarios

- **GET** `/api/scenarios`
- **Auth:** Required
- **Query Parameters:**
- `projectId` (string, optional) - Filter by project
- `page` (number, default: 1)
- `limit` (number, default: 20)
- **Response:** `{ scenarios: Scenario[], meta: Pagination }`

```bash
curl -X GET "http://localhost:3000/api/scenarios?projectId=proj123" \
 -H "Authorization: Bearer $TOKEN"
```

#### Get Scenario

- **GET** `/api/scenarios/:id`
- **Auth:** Required
- **Response:** `{ scenario: Scenario }`

```bash
curl -X GET http://localhost:3000/api/scenarios/scen123 \
 -H "Authorization: Bearer $TOKEN"
```

#### Create Scenario

- **POST** `/api/projects/:projectId/scenarios`
- **Auth:** Required
- **Body:** `{ name: string, description: string, topology?: string, ... }`
- **Response:** `{ scenario: Scenario }`

```bash
curl -X POST http://localhost:3000/api/projects/proj123/scenarios \
 -H "Authorization: Bearer $TOKEN" \
 -H "Content-Type: application/json" \
 -d '{
 "name": "Scenario Name",
 "description": "Scenario description",
 "topology": "nodes:\n - id: node1\n label: Service 1"
 }'
```

#### Update Scenario

- **PUT** `/api/scenarios/:id`
- **Auth:** Required
- **Body:** `{ name?: string, topology?: string, ... }`
- **Response:** `{ scenario: Scenario }`

```bash
curl -X PUT http://localhost:3000/api/scenarios/scen123 \
 -H "Authorization: Bearer $TOKEN" \
 -H "Content-Type: application/json" \
 -d '{
 "topology": "nodes:\n - id: node1\n label: Updated Service"
 }'
```

#### Delete Scenario

- **DELETE** `/api/scenarios/:id`
- **Auth:** Required
- **Response:** `{ message: "Scenario deleted" }`

```bash
curl -X DELETE http://localhost:3000/api/scenarios/scen123 \
 -H "Authorization: Bearer $TOKEN"
```

#### Execute Scenario

Deploys the scenario's topology directly to the assigned infrastructure's
Kubernetes cluster. See [Kubernetes Execution](integration/kubernetes-execution.md).

- **POST** `/api/scenarios/:id/execute`
- **Auth:** Required
- **Body:** None (the target infrastructure comes from the scenario)
- **Response:** `{ executionId: string, namespace: string, status: string, services: DeployedService[] }`

```bash
curl -X POST http://localhost:3000/api/scenarios/scen123/execute \
 -H "Authorization: Bearer $TOKEN"
```

#### Stream Execution Events (SSE)

- **GET** `/api/scenarios/:id/executions/:executionId/events`
- **Auth:** Required
- **Content-Type:** `text/event-stream`
- **Events:** `progress`, `log`, `end`, `error` — see
  [SSE Events Protocol](integration/kubernetes-execution.md#sse-events-protocol)

#### Tear Down Execution

- **DELETE** `/api/scenarios/:id/executions/:executionId`
- **Auth:** Required
- **Response:** `{ executionId, namespace, status: "completed", message }`

### Infrastructures

#### List Infrastructures

- **GET** `/api/infrastructures`
- **Auth:** Required
- **Query Parameters:**
- `type` (string, optional) - Filter by type (kubernetes, docker, vm)
- `page` (number, default: 1)
- `limit` (number, default: 20)
- **Response:** `{ infrastructures: Infrastructure[], meta: Pagination }`

```bash
curl -X GET "http://localhost:3000/api/infrastructures?type=kubernetes" \
 -H "Authorization: Bearer $TOKEN"
```

#### Get Infrastructure

- **GET** `/api/infrastructures/:id`
- **Auth:** Required
- **Response:** `{ infrastructure: Infrastructure }`

```bash
curl -X GET http://localhost:3000/api/infrastructures/infra123 \
 -H "Authorization: Bearer $TOKEN"
```

#### Create Infrastructure

- **POST** `/api/infrastructures`
- **Auth:** Required
- **Body:** `{ name: string, type: "kubernetes"|"docker"|"vm", credentials: object, ... }`
- **Response:** `{ infrastructure: Infrastructure }`

```bash
curl -X POST http://localhost:3000/api/infrastructures \
 -H "Authorization: Bearer $TOKEN" \
 -H "Content-Type: application/json" \
 -d '{
 "name": "K8s Cluster",
 "type": "kubernetes",
 "credentials": {
 "apiServer": "https://k8s.example.com",
 "token": "xxx"
 }
 }'
```

#### Update Infrastructure

- **PUT** `/api/infrastructures/:id`
- **Auth:** Required
- **Body:** `{ name?: string, credentials?: object, ... }`
- **Response:** `{ infrastructure: Infrastructure }`

```bash
curl -X PUT http://localhost:3000/api/infrastructures/infra123 \
 -H "Authorization: Bearer $TOKEN" \
 -H "Content-Type: application/json" \
 -d '{"name": "Updated K8s Cluster"}'
```

#### Delete Infrastructure

- **DELETE** `/api/infrastructures/:id`
- **Auth:** Required
- **Response:** `{ message: "Infrastructure deleted" }`

```bash
curl -X DELETE http://localhost:3000/api/infrastructures/infra123 \
 -H "Authorization: Bearer $TOKEN"
```

#### Test Infrastructure Connection

- **POST** `/api/infrastructures/:id/test`
- **Auth:** Required
- **Response:** `{ success: boolean, message: string }`

```bash
curl -X POST http://localhost:3000/api/infrastructures/infra123/test \
 -H "Authorization: Bearer $TOKEN"
```

### Categories

#### List Categories

- **GET** `/api/categories`
- **Auth:** Required
- **Response:** `{ categories: Category[] }`

```bash
curl -X GET http://localhost:3000/api/categories \
 -H "Authorization: Bearer $TOKEN"
```

#### Get Category

- **GET** `/api/categories/:id`
- **Auth:** Required
- **Response:** `{ category: Category }`

```bash
curl -X GET http://localhost:3000/api/categories/cat1 \
 -H "Authorization: Bearer $TOKEN"
```

#### Create Category

- **POST** `/api/categories`
- **Auth:** Required (admin only)
- **Body:** `{ name: string, description?: string }`
- **Response:** `{ category: Category }`

```bash
curl -X POST http://localhost:3000/api/categories \
 -H "Authorization: Bearer $TOKEN" \
 -H "Content-Type: application/json" \
 -d '{
 "name": "Category Name",
 "description": "Category description"
 }'
```

#### Update Category

- **PUT** `/api/categories/:id`
- **Auth:** Required (admin only)
- **Body:** `{ name?: string, description?: string }`
- **Response:** `{ category: Category }`

```bash
curl -X PUT http://localhost:3000/api/categories/cat1 \
 -H "Authorization: Bearer $TOKEN" \
 -H "Content-Type: application/json" \
 -d '{"name": "Updated Category"}'
```

#### Delete Category

- **DELETE** `/api/categories/:id`
- **Auth:** Required (admin only)
- **Response:** `{ message: "Category deleted" }`

```bash
curl -X DELETE http://localhost:3000/api/categories/cat1 \
 -H "Authorization: Bearer $TOKEN"
```

## Data Models

### User

```typescript
{
  id: string;
  username: string;
  email: string;
  password: string; // hashed
  role: 'admin' | 'user';
  createdAt: Date;
  updatedAt: Date;
}
```

### Service

```typescript
{
  id: string;
  name: string;
  description: string;
  categoryId: string; // Reference to Category
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}
```

### Project

```typescript
{
  id: string;
  name: string;
  description: string;
  sector: 'Telecommunications' | 'Healthcare' | 'Transportation' | 'Nuclear';
  owner: string; // User ID
  createdAt: Date;
  updatedAt: Date;
}
```

### Scenario

```typescript
{
  id: string;
  projectId: string; // Reference to Project
  name: string;
  description: string;
  topology: string; // YAML format
  status: 'draft' | 'ready' | 'executed';
  createdAt: Date;
  updatedAt: Date;
}
```

### Infrastructure

```typescript
{
  id: string;
  name: string;
  type: 'kubernetes' | 'docker' | 'vm';
  // `credentials` is stored AES-256-GCM encrypted and is NEVER returned by the
  // API — list, detail, create and update responses project it out (issue #38).
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### Category

```typescript
{
 id: string;
 name: string;
 description?: string;
 createdAt: Date;
 updatedAt: Date;
}
```

## Error Codes

| Code | Meaning      | Description                                            |
| ---- | ------------ | ------------------------------------------------------ |
| 200  | OK           | Request succeeded                                      |
| 201  | Created      | Resource created successfully                          |
| 400  | Bad Request  | Invalid request data or parameters                     |
| 401  | Unauthorized | Missing or invalid authentication token                |
| 403  | Forbidden    | Authenticated but not authorized for this action       |
| 404  | Not Found    | Resource not found                                     |
| 409  | Conflict     | Resource already exists or conflict with current state |
| 500  | Server Error | Unexpected server error                                |

## Pagination

List endpoints support pagination:

**Query Parameters:**

- `page` (number) - Page number (default: 1)
- `limit` (number) - Items per page (default: 20, max: 100)

**Response Meta:**

```json
{
  "meta": {
    "total": 150,
    "page": 2,
    "limit": 20,
    "totalPages": 8
  }
}
```

**Example:**

```bash
# Get page 2 with 50 items
curl -X GET "http://localhost:3000/api/services?page=2&limit=50" \
 -H "Authorization: Bearer $TOKEN"
```

## Filtering

Most endpoints support filters via query parameters:

| Filter     | Example            | Behavior                             |
| ---------- | ------------------ | ------------------------------------ |
| `search`   | `?search=firewall` | Full-text search on name/description |
| `category` | `?category=cat1`   | Exact match on category              |
| `status`   | `?status=active`   | Exact match on status                |
| `sector`   | `?sector=Telecom`  | Exact match on sector                |
| `type`     | `?type=kubernetes` | Exact match on type                  |

**Example:**

```bash
curl -X GET "http://localhost:3000/api/services?search=firewall&category=cat1&page=1" \
 -H "Authorization: Bearer $TOKEN"
```

## Rate Limiting

API rate limits (planned, not yet implemented):

- 100 requests per minute per IP
- 1000 requests per hour per authenticated user

## Testing APIs

### Using curl

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
 -H "Content-Type: application/json" \
 -d '{"username":"admin","password":"<ADMIN_PASSWORD>"}' | jq -r '.token')

# Use token
curl -X GET http://localhost:3000/api/services \
 -H "Authorization: Bearer $TOKEN"
```

### Using REST Client (VS Code)

Create `test.http`:

```http
@baseUrl = http://localhost:3000
@token = <your-token>

### Login
POST {{baseUrl}}/api/auth/login
Content-Type: application/json

{
 "username": "admin",
 "password": "<ADMIN_PASSWORD>"
}

### Get Services
GET {{baseUrl}}/api/services
Authorization: Bearer {{token}}

### Create Service
POST {{baseUrl}}/api/services
Authorization: Bearer {{token}}
Content-Type: application/json

{
 "name": "New Service",
 "description": "Service description",
 "categoryId": "cat1"
}
```

### Using Postman

1. Create collection "INTACT API"
2. Add requests for each endpoint
3. Use environment variables for `baseUrl` and `token`
4. Save requests for reuse

## Related Documentation

- [Backend Architecture](architecture/backend.md) - API implementation details
- [Data Flow](architecture/data-flow.md) - Request flow diagrams
- [Database Schema](database/schema.md) - MongoDB collections
- [Development Guide](DEVELOPMENT.md) - Local testing setup
