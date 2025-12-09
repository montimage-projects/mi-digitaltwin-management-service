# Server Module

Express backend API for the INTACT Digital Twin Management Platform.

## Overview

The server provides a RESTful API for managing cybersecurity services, digital twin projects, scenarios, and infrastructure configurations. It uses MongoDB for data persistence and JWT for authentication.

## Prerequisites

- [Bun](https://bun.sh/) 1.0+ (or Node.js 18+)
- Docker (for MongoDB)
- MongoDB running on `localhost:27017`

## Quick Start

```bash
# Start MongoDB
docker-compose up -d mongodb

# Install dependencies
bun install

# Configure environment
cp .env.example .env

# Seed the database
bun run seed

# Start development server
bun run dev
```

The API will be available at `http://localhost:3000`.

## Available Scripts

| Script               | Description                              |
| -------------------- | ---------------------------------------- |
| `bun run dev`        | Start development server with hot reload |
| `bun run start`      | Start production server                  |
| `bun run seed`       | Seed database with initial data          |
| `bun run lint`       | Run ESLint                               |
| `bun run lint --fix` | Fix auto-fixable lint issues             |
| `bun run format`     | Format code with Prettier                |

## Project Structure

```
src/
├── config/             # Configuration
│   ├── database.ts     # MongoDB connection
│   └── env.ts          # Environment variables
├── middleware/         # Express middleware
│   ├── auth.ts         # JWT authentication
│   ├── validate.ts     # Zod validation
│   └── errorHandler.ts # Error handling
├── models/             # Mongoose schemas
│   ├── User.ts
│   ├── Service.ts
│   ├── Project.ts
│   ├── Scenario.ts
│   ├── Infrastructure.ts
│   └── Category.ts
├── routes/             # API routes
│   ├── auth.ts
│   ├── services.ts
│   ├── projects.ts
│   ├── scenarios.ts
│   └── infrastructures.ts
├── validators/         # Zod schemas
├── seed/               # Database seeding
├── utils/              # Utilities
│   └── encryption.ts   # AES-256 encryption
└── app.ts              # Application entry
```

## Environment Variables

| Variable         | Description               | Default                            |
| ---------------- | ------------------------- | ---------------------------------- |
| `PORT`           | Server port               | `3000`                             |
| `MONGODB_URI`    | MongoDB connection        | `mongodb://localhost:27017/intact` |
| `JWT_SECRET`     | JWT signing secret        | (required)                         |
| `JWT_EXPIRES_IN` | Token expiration          | `24h`                              |
| `CORS_ORIGIN`    | Allowed CORS origin       | `http://localhost:5173`            |
| `ENCRYPTION_KEY` | Credential encryption key | (required, 32 chars)               |

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
| Bun        | JavaScript runtime |
| Express    | HTTP framework     |
| MongoDB    | Document database  |
| Mongoose   | ODM for MongoDB    |
| Zod        | Schema validation  |
| JWT        | Authentication     |
| bcrypt     | Password hashing   |

## Testing

```bash
# Run tests
bun test

# Run specific test file
bun test src/routes/services.test.ts
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
bun run seed
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

## Related Documentation

- [Backend Architecture](../docs/architecture/backend.md)
- [Database Schema](../docs/database/schema.md)
- [Development Playbook](../docs/playbooks/development.md)
