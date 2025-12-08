# INTACT Digital Twin Management Platform

A centralized web platform for managing the INTACT cybersecurity service repository and orchestrating Digital Twin projects.

## Prerequisites

- [Bun](https://bun.sh/) (v1.0+)
- [Docker](https://www.docker.com/) and Docker Compose
- Node.js 18+ (optional, for compatibility)

## Quick Start

### 1. Start MongoDB

```bash
docker-compose up -d mongodb
```

### 2. Set up the Backend

```bash
cd server
cp .env.example .env
bun install
bun run seed  # Seed the database with initial data
bun run dev   # Start development server
```

The API will be available at `http://localhost:3000`

### 3. Set up the Frontend

```bash
cd client
cp .env.example .env
bun install
bun run dev
```

The frontend will be available at `http://localhost:5173`

### 4. Login

Use the default admin credentials:
- Username: `admin`
- Password: `intact2025`

## Project Structure

```
/
├── client/          # React frontend (Vite + TypeScript)
├── server/          # Express backend (Bun + TypeScript)
├── docker-compose.yml
└── README.md
```

## Available Scripts

### Server

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server with hot reload |
| `bun run start` | Start production server |
| `bun run seed` | Seed database with initial data |
| `bun run lint` | Run ESLint |
| `bun run format` | Format code with Prettier |

### Client

| Command | Description |
|---------|-------------|
| `bun run dev` | Start Vite dev server |
| `bun run build` | Build for production |
| `bun run preview` | Preview production build |
| `bun run lint` | Run ESLint |

## Environment Variables

### Server (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/intact` |
| `JWT_SECRET` | JWT signing secret | - |
| `JWT_EXPIRES_IN` | Token expiration | `24h` |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost:5173` |

### Client (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:3000` |

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with credentials
- `GET /api/auth/me` - Get current user

### Services
- `GET /api/services` - List services (with filters)
- `GET /api/services/:id` - Get service details

### Categories
- `GET /api/categories` - List all categories

### Health
- `GET /api/health` - Health check

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite
- Tailwind CSS + shadcn/ui
- React Router v6
- React Query
- Zustand

### Backend
- Bun runtime
- Express.js
- MongoDB + Mongoose
- JWT authentication
- Zod validation

## License

Proprietary - INTACT Consortium
