# Server Module

Express backend API for the MI Digital Twin Management Service.

## Overview

The server provides a RESTful API for managing cybersecurity services, digital twin projects, scenarios, and infrastructure configurations. It uses MongoDB for data persistence and JWT for authentication.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- Docker (for MongoDB)
- MongoDB running on `localhost:27017`

## Quick Start

```bash
# Start MongoDB
docker-compose up -d mongodb

# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Seed the database
npm run seed

# Start development server
npm run dev
```

The API will be available at `http://localhost:3000`.

## Available Scripts

| Script               | Description                              |
| -------------------- | ---------------------------------------- |
| `npm run dev`        | Start development server with hot reload |
| `npm run start`      | Start production server                  |
| `npm run seed`       | Seed database with initial data          |
| `npm run lint`       | Run ESLint                               |
| `npm run lint --fix` | Fix auto-fixable lint issues             |
| `npm run format`     | Format code with Prettier                |

## Project Structure

```
src/
 config/ # Configuration
 database.ts # MongoDB connection
 env.ts # Environment variables
 middleware/ # Express middleware
 auth.ts # JWT authentication
 validate.ts # Zod validation
 errorHandler.ts # Error handling
 models/ # Mongoose schemas
 User.ts
 Service.ts
 Project.ts
 Scenario.ts
 Infrastructure.ts
 Category.ts
 routes/ # API routes
 auth.ts
 services.ts
 projects.ts
 scenarios.ts
 infrastructures.ts
 validators/ # Zod schemas
 seed/ # Database seeding
 utils/ # Utilities
 encryption.ts # AES-256 encryption
 app.ts # Application entry
```

## Environment Variables

| Variable         | Description                    | Default                            |
| ---------------- | ------------------------------ | ---------------------------------- |
| `PORT`           | Server port                    | `3000`                             |
| `MONGODB_URI`    | MongoDB connection             | `mongodb://localhost:27017/intact` |
| `JWT_SECRET`     | JWT signing secret             | (required)                         |
| `JWT_EXPIRES_IN` | Token expiration               | `24h`                              |
| `CORS_ORIGIN`    | Allowed CORS origin            | `http://localhost:5173`            |
| `ENCRYPTION_KEY` | Credential encryption key      | (required, 32 chars)               |
| `SERVE_STATIC`   | Serve client build from server | `false`                            |

## API Endpoints

### Authentication

| Method | Endpoint           | Description      |
| ------ | ------------------ | ---------------- |
| POST   | `/api/auth/login`  | Login            |
| GET    | `/api/auth/me`     | Get current user |
| POST   | `/api/auth/logout` | Logout           |

### Services

| Method | Endpoint            | Description    |
| ------ | ------------------- | -------------- |
| GET    | `/api/services`     | List services  |
| GET    | `/api/services/:id` | Get service    |
| POST   | `/api/services`     | Create service |
| PUT    | `/api/services/:id` | Update service |
| DELETE | `/api/services/:id` | Delete service |

### Projects

| Method | Endpoint            | Description    |
| ------ | ------------------- | -------------- |
| GET    | `/api/projects`     | List projects  |
| GET    | `/api/projects/:id` | Get project    |
| POST   | `/api/projects`     | Create project |
| PUT    | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project |

### Scenarios

| Method | Endpoint                      | Description      |
| ------ | ----------------------------- | ---------------- |
| GET    | `/api/projects/:id/scenarios` | List scenarios   |
| POST   | `/api/projects/:id/scenarios` | Create scenario  |
| GET    | `/api/scenarios/:id`          | Get scenario     |
| PUT    | `/api/scenarios/:id`          | Update scenario  |
| DELETE | `/api/scenarios/:id`          | Delete scenario  |
| POST   | `/api/scenarios/:id/execute`  | Execute scenario |

### Health

| Method | Endpoint      | Description  |
| ------ | ------------- | ------------ |
| GET    | `/api/health` | Health check |

## Technology Stack

| Technology | Purpose            |
| ---------- | ------------------ |
| Node.js    | JavaScript runtime |
| Express    | HTTP framework     |
| MongoDB    | Document database  |
| Mongoose   | ODM for MongoDB    |
| Zod        | Schema validation  |
| JWT        | Authentication     |
| bcrypt     | Password hashing   |

## Testing

```bash
# Run tests
npm test

# Run specific test file
npx vitest run src/routes/services.test.ts
```

## Database

### Connecting to MongoDB Shell

```bash
docker-compose exec mongodb mongosh intact
```

### Common Queries

```javascript
// List users
db.users.find().pretty();

// Count services
db.services.countDocuments();

// Find services by category
db.services.find({ categoryId: ObjectId('...') });
```

### Resetting Database

```bash
# Clear and reseed
docker-compose exec mongodb mongosh intact --eval "db.dropDatabase()"
npm run seed
```

## Troubleshooting

### Connection Refused

Ensure MongoDB is running:

```bash
docker-compose up -d mongodb
docker-compose ps
```

### Authentication Errors

Check JWT_SECRET is set in `.env`.

### Encryption Errors

Ensure ENCRYPTION_KEY is exactly 32 characters.

## Static File Serving

The server can serve the client's production build directly, enabling a single-process deployment.

### Enabling Static Serving

```bash
# Build the client
cd client && npm run build

# Start server with static serving
cd server
SERVE_STATIC=true npm run start
```

The full application will be available at `http://localhost:3000`.

### How It Works

When `SERVE_STATIC=true`:

1. Server serves static files from `../client/dist`
2. API endpoints remain at `/api/*`
3. All other routes return `index.html` (SPA fallback)

### Docker Deployment

For production deployment with automatic database seeding:

```bash
# Build and start (from project root)
docker compose -f docker-compose.prod.yml up -d --build
```

This will:

1. Build the unified image (server + client)
2. Start MongoDB
3. Automatically seed the database on first startup

See [Deployment Playbook](../docs/playbooks/deployment.md) for details.

## Next Steps

- **Getting Started?** → [Development Guide](../docs/DEVELOPMENT.md)
- **API Endpoints?** → [API Reference](../docs/API.md)
- **Database Help?** → [Database Schema](../docs/database/schema.md)
- **Deploy to Production?** → [Deployment Guide](../docs/DEPLOYMENT.md)
- **Need Help?** → [Troubleshooting](../docs/troubleshooting/common-issues.md)

## Related Documentation

- [Backend Architecture](../docs/architecture/backend.md) - Express API structure and layers
- [API Reference](../docs/API.md) - Complete REST endpoint reference with examples
- [Database Schema](../docs/database/schema.md) - MongoDB collections and fields
- [Database Relationships](../docs/database/relationships.md) - Collection references
- [Development Guide](../docs/DEVELOPMENT.md) - Full development workflow
- [Deployment Guide](../docs/DEPLOYMENT.md) - Production deployment checklist
- [Development Playbook](../docs/playbooks/development.md) - Step-by-step setup
