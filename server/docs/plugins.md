# Plugin API Reference

The plugin system provides a structured way to extend the Digital Twin Management
Platform without modifying core code. Plugins follow a well-defined lifecycle and
can contribute middleware, routes, and startup logic.

## Table of Contents

- [Architecture](#architecture)
- [Plugin Lifecycle](#plugin-lifecycle)
- [Plugin Interface](#plugin-interface)
- [Creating a Plugin](#creating-a-plugin)
- [Loading Plugins](#loading-plugins)
- [Plugin Dependencies](#plugin-dependencies)
- [Error Handling](#error-handling)
- [Testing Plugins](#testing-plugins)

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Express App                     │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  Route   │  │ Middleware│  │  Plugin API   │   │
│  │  Mounts  │  │  Chain   │  │  Endpoints    │   │
│  └──────────┘  └──────────┘  └──────────────┘   │
│                                                   │
│  ┌───────────────────────────────────────────┐   │
│  │           PluginLoader                     │   │
│  │                                           │   │
│  │  ┌─────────┐  ┌─────────┐  ┌──────────┐  │   │
│  │  │ Plugin A│  │ Plugin B│  │ Plugin C  │  │   │
│  │  │ (core)  │  │(feature) │  │(optional) │  │   │
│  │  └─────────┘  └─────────┘  └──────────┘  │   │
│  └───────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

Plugins are loaded by `PluginLoader`, which:

1. **Resolves** plugins from an explicit list or auto-discovers from a directory.
2. **Validates** dependencies (missing refs, cycles).
3. **Sorts** plugins topologically so dependencies start first.
4. **Mounts** middleware and routes on the Express app.

## Plugin Lifecycle

Each plugin goes through four states:

```
INACTIVE → REGISTERED → STARTED → STOPPED
                         ↓
                       ERROR
```

| Phase    | Hook         | When called                                | Purpose                            |
| -------- | ------------ | ------------------------------------------ | ---------------------------------- |
| Register | `register()` | During `loader.load()`                     | Static validation, config checks   |
| Start    | `start()`    | During `loader.start(app)`                 | Async init (DB, caches, workers)   |
| Runtime  | —            | After start, before stop                   | Plugin is active and serving       |
| Stop     | `stop()`     | During `loader.stop()` (graceful shutdown) | Cleanup connections, timers, files |

### Lifecycle guarantees

- `register()` is called **once** per plugin instance.
- `start()` is called **once** per plugin instance, after all `register()` hooks.
- `stop()` is called in **reverse dependency order** during shutdown.
- All hooks are `async` and must complete within the configured timeout (default 30s).

## Plugin Interface

A plugin is a plain JavaScript/TypeScript object conforming to the `Plugin` interface:

```typescript
interface Plugin {
  metadata: PluginMetadata;
  register?: () => Promise<void>;
  start?: () => Promise<void>;
  stop?: () => Promise<void>;
  middleware?: RequestHandler[];
  router?: Router;
  routerPath?: string;
}
```

### PluginMetadata

| Field         | Type       | Required | Description                      |
| ------------- | ---------- | -------- | -------------------------------- |
| `id`          | `string`   | Yes      | Unique kebab-case identifier     |
| `name`        | `string`   | Yes      | Human-readable name              |
| `version`     | `string`   | Yes      | Semver string (e.g. `"1.0.0"`)   |
| `description` | `string`   | Yes      | What the plugin does             |
| `author`      | `string`   | No       | Author or team name              |
| `dependsOn`   | `string[]` | No       | Other plugin IDs this depends on |
| `license`     | `string`   | No       | SPDX license identifier          |

## Creating a Plugin

### Minimal plugin

```typescript
// plugins/my-plugin/index.ts
import type { Plugin } from '../../plugins/types.js';

const myPlugin: Plugin = {
  metadata: {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    description: 'A simple example plugin',
  },
};

export default myPlugin;
```

### Plugin with routes

```typescript
import type { Plugin } from '../../plugins/types.js';
import { Router } from 'express';

const router = Router();

router.get('/hello', (_req, res) => {
  res.json({ message: 'Hello from plugin!' });
});

const myPlugin: Plugin = {
  metadata: {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    description: 'Plugin with custom routes',
  },
  router,
  routerPath: '/api/my-plugin',
};

export default myPlugin;
```

### Plugin with middleware

```typescript
import type { Plugin, RequestHandler } from '../../plugins/types.js';

const loggingMiddleware: RequestHandler = (req, _res, next) => {
  console.log(`[${req.method}] ${req.url}`);
  next();
};

const myPlugin: Plugin = {
  metadata: {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    description: 'Plugin with middleware',
  },
  middleware: [loggingMiddleware],
};

export default myPlugin;
```

### Plugin with full lifecycle

```typescript
import type { Plugin } from '../../plugins/types.js';

const myPlugin: Plugin = {
  metadata: {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    description: 'Full lifecycle plugin',
  },
  register: async () => {
    // Validate configuration, check required env vars
    if (!process.env.MY_API_KEY) {
      throw new Error('MY_API_KEY environment variable is required');
    }
  },
  start: async () => {
    // Connect to external service, warm cache
    console.log('My Plugin started');
  },
  stop: async () => {
    // Close connections, clean up resources
    console.log('My Plugin stopped');
  },
};

export default myPlugin;
```

## Loading Plugins

### Explicit plugin list

```typescript
import { PluginLoader } from './plugins/index.js';
import myPlugin from './plugins/my-plugin/index.js';
import anotherPlugin from './plugins/another-plugin/index.js';

const loader = new PluginLoader({
  plugins: [myPlugin, anotherPlugin],
  failFast: false,
  startTimeout: 30_000,
});

// Load all plugins
const result = await loader.load();
console.log(`Loaded ${result.loaded}, failed ${result.failed}`);

// Start plugins and mount on Express app
await loader.start(app);
```

### Auto-discovery from directory

```typescript
const loader = new PluginLoader({
  pluginDir: './plugins',
  failFast: false,
});
```

The loader scans each subdirectory for an `index.js` file and imports the default export.

## Plugin Dependencies

Plugins can declare dependencies on other plugins using the `dependsOn` field:

```typescript
const databasePlugin: Plugin = {
  metadata: {
    id: 'database-plugin',
    name: 'Database Plugin',
    version: '1.0.0',
    description: 'Database connection management',
  },
};

const cachePlugin: Plugin = {
  metadata: {
    id: 'cache-plugin',
    name: 'Cache Plugin',
    version: '1.0.0',
    description: 'In-memory caching layer',
    dependsOn: ['database-plugin'],
  },
};
```

### Dependency rules

1. **All dependencies must be loaded** — missing dependencies cause a load failure.
2. **No cycles allowed** — cyclic dependencies are detected and reported.
3. **Topological ordering** — dependencies always start before dependents.

### Dependency errors

```
Error: Plugin "cache-plugin" depends on "database-plugin" which is not loaded
Error: Cyclic dependency detected: plugin-a -> plugin-b -> plugin-a
```

## Error Handling

### Fail-fast mode

When `failFast: true` (default), the first plugin error aborts the entire load:

```typescript
const loader = new PluginLoader({ failFast: true });
await loader.load(); // throws on first error
```

### Graceful mode

When `failFast: false`, errors are collected and non-fatal plugins continue:

```typescript
const loader = new PluginLoader({ failFast: false });
const result = await loader.load();

for (const error of result.errors) {
  console.error(`Plugin ${error.pluginId} failed: ${error.message}`);
}
```

### Start timeout

Plugins that exceed the start timeout are marked as `ERROR`:

```typescript
const loader = new PluginLoader({
  startTimeout: 5_000, // 5 seconds
});
```

## Testing Plugins

### Unit test

```typescript
import { describe, it, expect } from 'vitest';
import { PluginLoader } from '../loader.js';
import type { Plugin } from '../types.js';

function createTestPlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    metadata: {
      id: 'test-plugin',
      name: 'Test',
      version: '1.0.0',
      description: 'Test plugin',
      ...overrides.metadata,
    },
    ...overrides,
  };
}

describe('My Plugin', () => {
  it('registers successfully', async () => {
    const plugin = createTestPlugin();
    const loader = new PluginLoader({
      plugins: [plugin],
      failFast: true,
    });
    const result = await loader.load();
    expect(result.loaded).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('calls start hook', async () => {
    let started = false;
    const plugin = createTestPlugin({
      start: async () => {
        started = true;
      },
    });
    const loader = new PluginLoader({
      plugins: [plugin],
      failFast: true,
    });
    await loader.load();
    const app = require('express')();
    await loader.start(app);
    expect(started).toBe(true);
  });
});
```

### Integration test

```typescript
import request from 'supertest';

describe('Plugin API', () => {
  it('responds to plugin routes', async () => {
    const response = await request(app).get('/api/my-plugin/hello').expect(200);

    expect(response.body.message).toBe('Hello from plugin!');
  });
});
```

## Plugin API Endpoints

The plugin system exposes these endpoints on the Express app:

| Method | Path                     | Description              |
| ------ | ------------------------ | ------------------------ |
| GET    | `/api/plugins`           | List all loaded plugins  |
| GET    | `/api/plugins/:id`       | Get details for a plugin |
| GET    | `/api/plugins/:id/state` | Get current plugin state |

### List plugins response

```json
{
  "plugins": [
    {
      "id": "my-plugin",
      "name": "My Plugin",
      "version": "1.0.0",
      "state": "started",
      "description": "A simple example plugin"
    }
  ]
}
```

### Plugin state response

```json
{
  "id": "my-plugin",
  "state": "started",
  "loadedAt": "2025-01-15T10:30:00.000Z",
  "error": null
}
```

## Best Practices

1. **Keep plugins self-contained** — each plugin should manage its own state and resources.
2. **Use dependency injection** — access shared state through plugin metadata, not globals.
3. **Handle errors gracefully** — always wrap async operations in try/catch.
4. **Clean up in stop()** — close connections, cancel timers, delete temp files.
5. **Version your plugins** — use semantic versioning to track breaking changes.
6. **Document your plugin** — include a README.md in your plugin directory.
7. **Test your plugin** — write unit tests for lifecycle hooks and integration tests for routes.

## Migration Guide

### From v0 to v1

The plugin system was introduced in v1.0.0. There are no breaking changes — this is a new feature.

### Adding a plugin to an existing project

1. Create a new directory under `server/plugins/`.
2. Add an `index.ts` file with your plugin definition.
3. Register the plugin in your loader configuration.
4. Test with `npm test`.

## See Also

- [Plugin types source](../src/plugins/types.ts)
- [Plugin loader source](../src/plugins/loader.ts)
- [Plugin tests](../src/plugins/__tests__/plugin-loader.test.ts)
