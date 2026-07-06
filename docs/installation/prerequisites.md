# Prerequisites

Required software and system requirements.

## Required Software

### Node.js

[Node.js](https://nodejs.org/) is the JavaScript runtime for this project.

**Version:** 20+

**Installation (via nvm):**

```bash
# Install nvm (if not already installed)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash

# Install and use Node.js 20
nvm install 20
nvm use 20

# Verify installation
node --version
npm --version
```

**Alternative (via fnm):**

```bash
# Install fnm (faster Node.js version manager)
brew install fnm

# Install and use Node.js 20
fnm install 20
fnm use 20
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
node --version # Should be 20+
npm --version # Should be 10+

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

# Check Node.js
if ! command -v node &> /dev/null; then
 echo "Node.js not found. Please install Node.js 20+."
 echo "https://nodejs.org/"
 exit 1
fi

# Check Docker
if ! command -v docker &> /dev/null; then
 echo "Docker not found. Please install Docker Desktop."
 echo "https://docs.docker.com/get-docker/"
 exit 1
fi

# Verify
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"
echo "Docker version: $(docker --version)"
echo "Prerequisites OK!"
```

## Troubleshooting

### Node.js Installation Fails

```bash
# Try with nvm
nvm install 20

# Or use fnm
fnm install 20
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
