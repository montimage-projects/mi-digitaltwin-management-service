# Prerequisites

Required software and system requirements.

## Required Software

### Bun (Primary Runtime)

[Bun](https://bun.sh/) is a fast JavaScript runtime and package manager.

**Version:** 1.0+

**Installation:**

```bash
# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# Windows (via PowerShell)
irm bun.sh/install.ps1 | iex

# Verify installation
bun --version
```

### Docker

[Docker](https://www.docker.com/) is required for running MongoDB and production deployments.

**Version:** 24.0+

**Installation:**

- **macOS:** [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)
- **Windows:** [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)
- **Linux:** [Docker Engine](https://docs.docker.com/engine/install/)

```bash
# Verify installation
docker --version
docker-compose --version
```

### Git

**Version:** 2.0+

```bash
# Verify installation
git --version
```

### Node.js (Optional)

Node.js is an optional fallback runtime.

**Version:** 18+

```bash
# Verify installation
node --version
npm --version
```

## System Requirements

### Development Machine

| Resource | Minimum               | Recommended  |
| -------- | --------------------- | ------------ |
| RAM      | 4 GB                  | 8 GB         |
| Disk     | 5 GB                  | 10 GB        |
| CPU      | 2 cores               | 4 cores      |
| OS       | macOS, Linux, Windows | macOS, Linux |

### Production Server

| Resource | Minimum  | Recommended |
| -------- | -------- | ----------- |
| RAM      | 2 GB     | 4 GB        |
| Disk     | 10 GB    | 50 GB       |
| CPU      | 2 cores  | 4 cores     |
| Network  | 100 Mbps | 1 Gbps      |

## Network Requirements

### Development

| Port  | Service | Purpose             |
| ----- | ------- | ------------------- |
| 5173  | Vite    | Frontend dev server |
| 3000  | Express | Backend API         |
| 27017 | MongoDB | Database            |

### Production

| Port  | Service | Purpose           |
| ----- | ------- | ----------------- |
| 80    | nginx   | HTTP              |
| 443   | nginx   | HTTPS (optional)  |
| 3000  | Express | Internal API      |
| 27017 | MongoDB | Internal database |

### Outbound Connections

Required for external integrations:

- MAESTRO orchestrator (configurable URL)
- Docker Hub or private registry (for images)
- MongoDB Atlas (if using cloud database)

## Browser Support

The web application supports modern browsers:

| Browser | Minimum Version |
| ------- | --------------- |
| Chrome  | 90+             |
| Firefox | 88+             |
| Safari  | 14+             |
| Edge    | 90+             |

**Note:** Internet Explorer is not supported.

## IDE Recommendations

### VS Code (Recommended)

**Extensions:**

- ESLint
- Prettier
- Tailwind CSS IntelliSense
- MongoDB for VS Code
- Thunder Client

### Alternative IDEs

- WebStorm
- Cursor
- Neovim with LSP

## Verification Checklist

Run these commands to verify your setup:

```bash
# Runtime
bun --version # Should be 1.0+
node --version # Should be 18+ (optional)

# Docker
docker --version # Should be 24.0+
docker-compose --version # Should be 2.0+
docker ps # Should work without errors

# Git
git --version # Should be 2.0+
```

## Quick Setup Script

For macOS/Linux:

```bash
#!/bin/bash
# setup-prerequisites.sh

# Install Bun
if ! command -v bun &> /dev/null; then
 echo "Installing Bun..."
 curl -fsSL https://bun.sh/install | bash
fi

# Check Docker
if ! command -v docker &> /dev/null; then
 echo "Docker not found. Please install Docker Desktop."
 echo "https://docs.docker.com/get-docker/"
 exit 1
fi

# Verify
echo "Bun version: $(bun --version)"
echo "Docker version: $(docker --version)"
echo "Prerequisites OK!"
```

## Troubleshooting

### Bun Installation Fails

```bash
# Try with explicit shell
curl -fsSL https://bun.sh/install | bash

# Add to PATH manually
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
```

### Docker Permission Denied

```bash
# Linux: Add user to docker group
sudo usermod -aG docker $USER
# Log out and back in
```

### Port Already in Use

```bash
# Find what's using the port
lsof -i :3000

# Kill the process
kill -9 <PID>
```

## Related Documentation

- [Configuration](configuration.md)
- [Development Playbook](../playbooks/development.md)
- [Deployment Playbook](../playbooks/deployment.md)
