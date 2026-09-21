# Configuration

Environment variables and application configuration.

## Environment Files

The application uses `.env` files for configuration:

```
/
 .env.example # Root template (used by docker-compose)
 client/
 .env # Client development config
 .env.example # Client template
 server/
 .env # Server development config
 .env.example # Server template
```

## Server Configuration

### Required Variables

These variables have no default and must be set — the server refuses to boot without them.

| Variable         | Description                                           | Example                              |
| ---------------- | ----------------------------------------------------- | ------------------------------------ |
| `JWT_SECRET`     | Secret for signing JWT tokens (min 32 characters)     | `your-super-secret-key-min-32-chars` |
| `ADMIN_PASSWORD` | Password for the seeded admin user (min 8 characters) | `change-me-strong-admin-password`    |
| `ENCRYPTION_KEY` | Key for encrypting credentials (min 16 characters)    | `change-me-strong-encryption-key`    |

### Optional Variables

| Variable           | Description                                                      | Default                             |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------- |
| `NODE_ENV`         | Environment mode                                                 | `development`                       |
| `PORT`             | Server port                                                      | `3000`                              |
| `SERVE_STATIC`     | Serve built client from the same origin (`true`/`false`/`1`/`0`) | unset (false)                       |
| `MONGODB_URI`      | MongoDB connection string                                        | `mongodb://localhost:27017/intact`  |
| `JWT_EXPIRES_IN`   | JWT token expiration                                             | `24h`                               |
| `CORS_ORIGIN`      | Allowed CORS origin                                              | `http://localhost:5173`             |
| `ADMIN_USERNAME`   | Username for the seeded admin user                               | `admin`                             |
| `MAESTRO_BASE_URL` | External Maestro API base URL                                    | `https://maestro.intact-project.eu` |
| `BRANDING_PROFILE` | Branding profile: `default` / `intact` / `secassured`            | `default`                           |
| `APP_NAME`         | Override application display name                                | (uses profile default)              |
| `ORG_NAME`         | Override organization name                                       | (uses profile default)              |
| `ORG_URL`          | Override organization URL                                        | (uses profile default)              |

### Example Server .env

```bash
# server/.env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/intact
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters
JWT_EXPIRES_IN=24h
CORS_ORIGIN=http://localhost:5173
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-strong-admin-password
ENCRYPTION_KEY=change-me-strong-encryption-key
MAESTRO_BASE_URL=https://maestro.intact-project.eu
BRANDING_PROFILE=secassured
```

## Client Configuration

### Available Variables

| Variable       | Description     | Default                 |
| -------------- | --------------- | ----------------------- |
| `VITE_API_URL` | Backend API URL | `http://localhost:3000` |

### Example Client .env

```bash
# client/.env
VITE_API_URL=http://localhost:3000
VITE_BRANDING_PROFILE=secassured
```

### Accessing Variables in Code

```typescript
// Client (Vite)
const apiUrl = import.meta.env.VITE_API_URL;

// Note: Only VITE_ prefixed variables are exposed to client
```

## Branding

The application name, logo, and favicon are configurable per deployment, so the
same codebase can be relaunched under a different brand without editing hardcoded
values across source files. Branding is selected with a single env var that names
one of the shipped **profiles**; individual fields can then be overridden with
per-field escape-hatch variables.

Branding resolves at **build time** on the client (`VITE_*` values are baked into
the bundle) and at **boot time** on the server. Changing a value therefore
requires rebuilding the client and restarting the server.

In the Docker Compose deployment path, the server-side `BRANDING_PROFILE`,
`APP_NAME`, `ORG_NAME`, and `ORG_URL` variables are now forwarded from the root
`.env` into the container by `docker-compose.prod.yml` and
`docker-compose.atlas.yml`; client-side `VITE_*` branding still requires building
the client with a matching `VITE_BRANDING_PROFILE`, which the unified image's
client-builder stage does not currently forward.

### Shipped Profiles

| Profile      | App name                          | Short name              | Logo / Favicon                                                 |
| ------------ | --------------------------------- | ----------------------- | -------------------------------------------------------------- |
| `default`    | `DigitalTwin Management Platform` | `Digital Twin Platform` | Montimage (`/montimage_logo.png`, `/montimage_favicon.png`)    |
| `intact`     | `DigitalTwin Management Platform` | `Digital Twin Platform` | INTACT (`/intact_logo.png`, `/intact_favicon.png`)             |
| `secassured` | `secSIM`                          | `secSIM`                | SecAssured (`/secassured_logo.png`, `/secassured_favicon.png`) |

Select a profile with one variable on each side:

| Variable                | Side   | Values                                | Default   |
| ----------------------- | ------ | ------------------------------------- | --------- |
| `VITE_BRANDING_PROFILE` | Client | `default` \| `intact` \| `secassured` | `default` |
| `BRANDING_PROFILE`      | Server | `default` \| `intact` \| `secassured` | `default` |

The client falls back to `default` on an unrecognized profile name; the server
rejects an invalid `BRANDING_PROFILE` at startup (zod enum validation).

### Per-Field Overrides

To tweak a single field without defining a whole new profile, set the matching
override variable. An override always wins over the active profile's value. The
logo/favicon assets referenced must exist in `client/public/`.

| Client variable        | Server variable | Overrides                                   |
| ---------------------- | --------------- | ------------------------------------------- |
| `VITE_APP_NAME`        | `APP_NAME`      | Application display name                    |
| `VITE_APP_NAME_SHORT`  | —               | Short app name (tight UI spaces)            |
| `VITE_LOGO_SRC`        | —               | Logo image path (under `client/public/`)    |
| `VITE_LOGO_ALT`        | —               | Logo alt text (accessibility)               |
| `VITE_FAVICON_SRC`     | —               | Favicon image path (under `client/public/`) |
| `VITE_ORG_NAME`        | `ORG_NAME`      | Owning organization name                    |
| `VITE_ORG_URL`         | `ORG_URL`       | Owning organization URL                     |
| `VITE_ORG_DESCRIPTION` | —               | Organization description (Settings "About") |
| `VITE_LOGO_BACKDROP`   | —               | Logo backdrop chip toggle (`true`/`false`)  |

> **Note:** The organization fields (`ORG_NAME`, `ORG_URL`, `ORG_DESCRIPTION`)
> default to Montimage for **all** profiles — including `intact` and
> `secassured` — and only change if you set their override variables. Only the
> app name, logo, and favicon vary per profile.

### Relaunching Under a Different Brand

1. Set the profile on both sides, e.g. in `client/.env` and `server/.env`:

   ```bash
   # client/.env
   VITE_BRANDING_PROFILE=secassured

   # server/.env
   BRANDING_PROFILE=secassured
   ```

2. (Optional) Add any per-field overrides, e.g. `VITE_ORG_NAME=SecAssured`.
3. Rebuild the client so the new title/favicon/logo are baked in:

   ```bash
   cd client && npm run build
   ```

4. Restart the server to pick up the new server-side app name.

## Generating Secure Keys

### JWT Secret

```bash
# Generate a secure random string (48 bytes, base64)
openssl rand -base64 48

# Output example:
# 7K3pQ9vJ2mX5bN8cF1wR4tY6uI0oP3aS2dF5gH8jK1lZ4xC7vB0nM
```

### Encryption Key

```bash
# Generate a 32-character hex key
openssl rand -hex 16

# Output example:
# a1b2c3d4e5f6789012345678abcdef01
```

## Production Configuration

### Environment Variables

Production deployments typically use `.env.prod` or Docker Compose environment files.
Key differences from development:

| Variable          | Development        | Production               |
| ----------------- | ------------------ | ------------------------ |
| `NODE_ENV`        | `development`      | `production`             |
| `PORT`            | `3000`             | `3000` (or behind proxy) |
| `JWT_EXPIRES_IN`  | `24h`              | `8h` (shorter)           |
| `CORS_ORIGIN`     | `http://localhost` | `https://your-domain`    |
| `MONGODB_URI`     | Local              | Atlas / managed          |
| `SERVE_STATIC`    | unset              | `true` (unified image)   |
| `SEED_ON_STARTUP` | unset              | `false`                  |

### Docker Compose Environment

Production compose files (`docker-compose.prod.yml`, `docker-compose.atlas.yml`)
read values from a root `.env` file and forward them to the server container:

```yaml
# docker-compose.prod.yml (excerpt)
services:
  server:
    environment:
      - NODE_ENV=${NODE_ENV:-production}
      - PORT=${PORT:-3000}
      - MONGODB_URI=${MONGODB_URI}
      - JWT_SECRET=${JWT_SECRET}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - BRANDING_PROFILE=${BRANDING_PROFILE:-secassured}
      - ADMIN_USERNAME=${ADMIN_USERNAME:-admin}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
```

## Configuration Schema

### Server Environment Validation

```typescript
// server/src/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform(Number),
  SERVE_STATIC: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/intact'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD must be at least 8 characters'),
  ENCRYPTION_KEY: z.string().min(16, 'ENCRYPTION_KEY must be at least 16 characters'),
  MAESTRO_BASE_URL: z.string().url().default('https://maestro.intact-project.eu'),
  BRANDING_PROFILE: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['default', 'intact', 'secassured']).default('default')
  ),
  APP_NAME: z.string().optional(),
  ORG_NAME: z.string().optional(),
  ORG_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
```

## CORS Configuration

### Development

```typescript
// Allow localhost in development
app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
  })
);
```

### Production

```typescript
// Restrict to specific domain
app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  })
);
```

## Database Configuration

### Connection Options

```typescript
// config/database.ts
mongoose.connect(process.env.MONGODB_URI, {
  // Connection pool
  maxPoolSize: 10,
  minPoolSize: 5,

  // Timeouts
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,

  // Retry
  retryWrites: true,
  retryReads: true,
});
```

### Environment-Specific URIs

| Environment | URI Pattern                                               |
| ----------- | --------------------------------------------------------- |
| Development | `mongodb://localhost:27017/intact`                        |
| Test        | `mongodb://localhost:27017/intact_test`                   |
| Production  | `mongodb+srv://user:pass@cluster.mongodb.net/intact_prod` |

## Security Considerations

### Secret Management

1. **Never commit secrets** to version control
2. Use `.env.example` files as templates (without real values)
3. Use secret managers in production (AWS Secrets Manager, HashiCorp Vault)

### .gitignore Configuration

```gitignore
# Environment files
.env
.env.local
.env.*.local

# Keep examples
!.env.example
```

### Rotating Secrets

1. Generate new secret
2. Update environment variable
3. Restart application
4. Verify functionality
5. Remove old secret from any backups

## Troubleshooting

### Missing Environment Variable

```
Error: Missing required environment variable: JWT_SECRET
```

**Solution:** Ensure `.env` file exists and contains all required variables.

### Invalid Configuration

```
Invalid environment variables:
{ ENCRYPTION_KEY: { _errors: [ 'ENCRYPTION_KEY must be at least 16 characters' ] } }
Error: Environment validation failed — fix the variables above and restart
```

**Solution:** Generate a new key with `openssl rand -hex 16`. `ENCRYPTION_KEY`
has no default — the server refuses to boot without it in every `NODE_ENV`.

### CORS Errors

```
Access to XMLHttpRequest blocked by CORS policy
```

**Solution:** Verify `CORS_ORIGIN` matches the client URL exactly.

## Related Documentation

- [Prerequisites](prerequisites.md)
- [Development Playbook](../playbooks/development.md)
- [Deployment Playbook](../playbooks/deployment.md)
