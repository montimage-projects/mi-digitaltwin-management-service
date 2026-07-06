# Configuration

Environment variables and application configuration.

## Environment Files

The application uses `.env` files for configuration:

```
/
 client/
 .env # Client development config
 .env.example # Client template
 server/
 .env # Server development config
 .env.example # Server template
 .env.prod # Production config (optional)
```

## Server Configuration

### Required Variables

| Variable         | Description                                  | Example                              |
| ---------------- | -------------------------------------------- | ------------------------------------ |
| `JWT_SECRET`     | Secret for signing JWT tokens (min 32 chars) | `your-super-secret-key-min-32-chars` |
| `ENCRYPTION_KEY` | Key for encrypting credentials (32 chars)    | `abcdef0123456789abcdef0123456789`   |

### Optional Variables

| Variable         | Description               | Default                            |
| ---------------- | ------------------------- | ---------------------------------- |
| `PORT`           | Server port               | `3000`                             |
| `MONGODB_URI`    | MongoDB connection string | `mongodb://localhost:27017/intact` |
| `JWT_EXPIRES_IN` | Token expiration          | `24h`                              |
| `CORS_ORIGIN`    | Allowed CORS origin       | `http://localhost:5173`            |
| `NODE_ENV`       | Environment mode          | `development`                      |

### Example Server .env

```bash
# server/.env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/intact
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters
JWT_EXPIRES_IN=24h
CORS_ORIGIN=http://localhost:5173
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef
NODE_ENV=development
```

## Client Configuration

### Available Variables

| Variable           | Description              | Default                             |
| ------------------ | ------------------------ | ----------------------------------- |
| `VITE_API_URL`     | Backend API URL          | `http://localhost:3000`             |
| `VITE_MAESTRO_URL` | MAESTRO orchestrator URL | `https://maestro.intact-project.eu` |

### Example Client .env

```bash
# client/.env
VITE_API_URL=http://localhost:3000
VITE_MAESTRO_URL=https://maestro.intact-project.eu
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

| Profile      | App name                          | Logo / Favicon                                              |
| ------------ | --------------------------------- | ----------------------------------------------------------- |
| `default`    | `DigitalTwin Management Platform` | Montimage (`/montimage_logo.png`, `/montimage_favicon.png`) |
| `intact`     | `DigitalTwin Management Platform` | INTACT (`/intact_logo.png`)                                 |
| `secassured` | `secSIM`                          | SecAssured (`/secassured_logo.png`)                         |

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

```bash
# .env.prod
PORT=80
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/intact_prod
JWT_SECRET=<generated-jwt-secret>
JWT_EXPIRES_IN=8h
CORS_ORIGIN=https://your-domain.com
ENCRYPTION_KEY=<generated-encryption-key>
NODE_ENV=production
```

### Docker Compose Override

```yaml
# docker-compose.prod.yml
services:
  server:
  environment:
    - NODE_ENV=production
    - PORT=3000
    - MONGODB_URI=${MONGODB_URI}
    - JWT_SECRET=${JWT_SECRET}
    - ENCRYPTION_KEY=${ENCRYPTION_KEY}
```

## Configuration Schema

### Server Environment Validation

```typescript
// config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3000'),
  MONGODB_URI: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
  CORS_ORIGIN: z.string().url(),
  ENCRYPTION_KEY: z.string().length(32),
  NODE_ENV: z.enum(['development', 'production', 'test']),
});

export const env = envSchema.parse(process.env);
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
.env.prod

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
Error: ENCRYPTION_KEY must be exactly 32 characters
```

**Solution:** Generate a new key with `openssl rand -hex 16`.

### CORS Errors

```
Access to XMLHttpRequest blocked by CORS policy
```

**Solution:** Verify `CORS_ORIGIN` matches the client URL exactly.

## Related Documentation

- [Prerequisites](prerequisites.md)
- [Development Playbook](../playbooks/development.md)
- [Deployment Playbook](../playbooks/deployment.md)
