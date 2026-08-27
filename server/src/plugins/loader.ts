import fs from 'node:fs';
import path from 'node:path';

import type { Express } from 'express';

import type {
  Plugin,
  PluginId,
  PluginInstance,
  PluginLoadError,
  PluginLoadResult,
  PluginLoaderConfig,
} from './types.js';
import { PluginState } from './types.js';

// ---------------------------------------------------------------------------
// Cyclic dependency detection (DFS)
// ---------------------------------------------------------------------------

/**
 * Detects cyclic dependencies in the plugin dependency graph.
 * Returns an array of cycle descriptions, or an empty array if clean.
 */
function detectCycles(plugins: Map<PluginId, Plugin>): string[] {
  const cycles: string[] = [];
  const visited = new Set<PluginId>();
  const inStack = new Set<PluginId>();

  function dfs(id: PluginId, path: PluginId[]): void {
    if (inStack.has(id)) {
      const cycleStart = path.indexOf(id);
      cycles.push(path.slice(cycleStart).concat(id).join(' -> '));
      return;
    }
    if (visited.has(id)) return;

    visited.add(id);
    inStack.add(id);
    path.push(id);

    const plugin = plugins.get(id);
    if (plugin?.metadata.dependsOn) {
      for (const dep of plugin.metadata.dependsOn) {
        dfs(dep, [...path]);
      }
    }

    inStack.delete(id);
  }

  for (const id of plugins.keys()) {
    dfs(id, []);
  }

  return cycles;
}

// ---------------------------------------------------------------------------
// Topological sort (Kahn's algorithm)
// ---------------------------------------------------------------------------

/**
 * Returns plugins in topological order so dependencies are started first.
 * Throws if a cycle is detected.
 */
function topologicalSort(plugins: Map<PluginId, Plugin>): PluginId[] {
  const inDegree = new Map<PluginId, number>();
  const adj = new Map<PluginId, PluginId[]>();

  for (const [id, plugin] of plugins) {
    if (!inDegree.has(id)) inDegree.set(id, 0);
    if (!adj.has(id)) adj.set(id, []);

    for (const dep of plugin.metadata.dependsOn ?? []) {
      if (!adj.has(dep)) adj.set(dep, []);
      if (!inDegree.has(dep)) inDegree.set(dep, 0);
      adj.get(dep)!.push(id);
      inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
    }
  }

  const queue: PluginId[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: PluginId[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    const neighbors = adj.get(current);
    if (neighbors) {
      for (const neighbor of neighbors) {
        const newDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }
  }

  if (sorted.length !== plugins.size) {
    throw new Error(
      'Cyclic dependency detected among plugins: ' + detectCycles(plugins).join(', ')
    );
  }

  return sorted;
}

// ---------------------------------------------------------------------------
// Plugin loader
// ---------------------------------------------------------------------------

/**
 * Loads, validates, and manages plugins for the Express application.
 */
export class PluginLoader {
  private config: PluginLoaderConfig;
  private instances = new Map<PluginId, PluginInstance>();
  private mounted = false;

  constructor(config: PluginLoaderConfig) {
    this.config = {
      failFast: false,
      startTimeout: 30_000,
      ...config,
    };
  }

  /**
   * Load all plugins from the explicit list or auto-discover from pluginDir.
   */
  async load(): Promise<PluginLoadResult> {
    const plugins = await this.resolvePlugins();
    const errors: PluginLoadError[] = [];
    const instances: PluginInstance[] = [];

    // Validate dependencies before loading
    this.validateDependencies(plugins);

    // Resolve topological order so dependencies register first
    const ordered = topologicalSort(new Map(plugins.map((p) => [p.metadata.id, p])));

    // Register phase (in dependency order)
    for (const id of ordered) {
      const plugin = plugins.find((p) => p.metadata.id === id);
      if (!plugin) continue;

      try {
        const instance: PluginInstance = {
          plugin,
          state: PluginState.INACTIVE,
          loadedAt: new Date(),
        };

        if (plugin.register) {
          await plugin.register();
          instance.state = PluginState.REGISTERED;
        }

        instances.push(instance);
        this.instances.set(plugin.metadata.id, instance);
      } catch (error) {
        const err: PluginLoadError = {
          pluginId: plugin.metadata.id,
          message: error instanceof Error ? error.message : String(error),
          cause: error instanceof Error ? error : undefined,
        };
        errors.push(err);
        if (this.config.failFast) {
          throw err;
        }
      }
    }

    return {
      loaded: instances.length,
      failed: errors.length,
      plugins: instances,
      errors,
    };
  }

  /**
   * Start all loaded plugins in dependency order.
   * Mounts middleware and routes on the Express app.
   */
  async start(app: Express): Promise<void> {
    if (this.mounted) return;

    const sorted = topologicalSort(
      new Map([...this.instances.entries()].map(([id, inst]) => [id, inst.plugin]))
    );

    for (const id of sorted) {
      const instance = this.instances.get(id);
      if (!instance) continue;

      try {
        if (instance.plugin.start) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), this.config.startTimeout);

          try {
            await Promise.race([
              instance.plugin.start(),
              new Promise((_, reject) =>
                setTimeout(() =>
                  reject(
                    new Error(`Plugin "${id}" start timed out after ${this.config.startTimeout}ms`)
                  )
                )
              ),
            ]);
          } finally {
            clearTimeout(timeoutId);
          }
        }
        instance.state = PluginState.STARTED;
      } catch (error) {
        instance.state = PluginState.ERROR;
        instance.error = error instanceof Error ? error.message : String(error);
        if (this.config.failFast) {
          throw error;
        }
      }
    }

    // Mount middleware and routes
    for (const instance of this.instances.values()) {
      if (instance.plugin.middleware) {
        for (const mw of instance.plugin.middleware) {
          app.use(mw);
        }
      }
      if (instance.plugin.router && instance.plugin.routerPath) {
        const router = instance.plugin.router;
        const routerPath = instance.plugin.routerPath;
        app.use(routerPath, router);
      }
    }

    this.mounted = true;
  }

  /**
   * Stop all started plugins in reverse dependency order.
   */
  async stop(): Promise<void> {
    const sorted = topologicalSort(
      new Map([...this.instances.entries()].map(([id, inst]) => [id, inst.plugin]))
    );
    const ids = [...sorted].reverse();
    for (const id of ids) {
      const instance = this.instances.get(id);
      if (!instance || instance.state !== PluginState.STARTED) continue;

      try {
        if (instance.plugin.stop) {
          await instance.plugin.stop();
        }
        instance.state = PluginState.STOPPED;
      } catch (error) {
        instance.state = PluginState.ERROR;
        instance.error = error instanceof Error ? error.message : String(error);
      }
    }
  }

  /**
   * Get the instance for a given plugin id.
   */
  getInstance(pluginId: PluginId): PluginInstance | undefined {
    return this.instances.get(pluginId);
  }

  /**
   * Get all loaded plugin instances.
   */
  getAllInstances(): PluginInstance[] {
    return [...this.instances.values()];
  }

  /**
   * Check if a plugin is in a given state.
   */
  isPluginInState(pluginId: PluginId, state: PluginState): boolean {
    return this.instances.get(pluginId)?.state === state;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async resolvePlugins(): Promise<Plugin[]> {
    if (this.config.plugins && this.config.plugins.length > 0) {
      return this.config.plugins;
    }

    if (!this.config.pluginDir) {
      return [];
    }

    const plugins: Plugin[] = [];
    const entries = fs.readdirSync(this.config.pluginDir);

    for (const entry of entries) {
      const fullPath = path.join(this.config.pluginDir, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        const indexFile = path.join(fullPath, 'index.js');
        if (fs.existsSync(indexFile)) {
          try {
            // Dynamic import for ESM
            const mod = await import(`file://${indexFile}`);
            if (mod.default && this.isPlugin(mod.default)) {
              plugins.push(mod.default);
            }
          } catch {
            // Skip plugins that fail to load
          }
        }
      }
    }

    return plugins;
  }

  private isPlugin(value: unknown): value is Plugin {
    if (!value || typeof value !== 'object') return false;
    const plugin = value as Record<string, unknown>;
    const metadata = plugin.metadata as Record<string, unknown> | undefined;
    return (
      typeof metadata === 'object' &&
      metadata !== null &&
      typeof metadata.id === 'string' &&
      typeof metadata.name === 'string' &&
      typeof metadata.version === 'string' &&
      typeof metadata.description === 'string'
    );
  }

  private validateDependencies(plugins: Plugin[]): void {
    const pluginMap = new Map(plugins.map((p) => [p.metadata.id, p]));
    const allIds = new Set(pluginMap.keys());

    // Check for missing dependencies
    for (const plugin of plugins) {
      for (const dep of plugin.metadata.dependsOn ?? []) {
        if (!allIds.has(dep)) {
          throw new Error(`Plugin "${plugin.metadata.id}" depends on "${dep}" which is not loaded`);
        }
      }
    }

    // Check for cycles
    const cycles = detectCycles(pluginMap);
    if (cycles.length > 0) {
      throw new Error(`Cyclic dependency detected: ${cycles.join('; ')}`);
    }
  }
}
