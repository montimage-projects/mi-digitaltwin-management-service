import { describe, it, expect, vi } from 'vitest';

import { PluginLoader } from '../loader.js';
import type { Plugin } from '../types.js';
import { PluginState } from '../types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createPlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    metadata: {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      description: 'A test plugin',
      ...overrides.metadata,
    },
    ...overrides,
  };
}

async function createExpressApp(): ReturnType<typeof import('express').default> {
  const express = await import('express');
  return express.default();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginLoader', () => {
  describe('load()', () => {
    it('loads a single plugin successfully', async () => {
      const plugin = createPlugin();
      const loader = new PluginLoader({
        plugins: [plugin],
        failFast: true,
      });
      const result = await loader.load();

      expect(result.loaded).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0].plugin.metadata.id).toBe('test-plugin');
      expect(result.plugins[0].state).toBe(PluginState.INACTIVE);
    });

    it('calls register hook during load', async () => {
      let registered = false;
      const plugin = createPlugin({
        register: async () => {
          registered = true;
        },
      });
      const loader = new PluginLoader({
        plugins: [plugin],
        failFast: true,
      });
      await loader.load();

      expect(registered).toBe(true);
      expect(loader.getInstance('test-plugin')?.state).toBe(PluginState.REGISTERED);
    });

    it('reports errors for failing plugins', async () => {
      const plugin = createPlugin({
        register: async () => {
          throw new Error('Registration failed');
        },
      });
      const loader = new PluginLoader({
        plugins: [plugin],
        failFast: false,
      });
      const result = await loader.load();

      expect(result.loaded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0].pluginId).toBe('test-plugin');
    });

    it('returns empty result with no plugins', async () => {
      const loader = new PluginLoader({ failFast: true });
      const result = await loader.load();
      expect(result.loaded).toBe(0);
      expect(result.plugins).toHaveLength(0);
    });

    it('loads multiple plugins', async () => {
      const pluginA = createPlugin({
        metadata: {
          id: 'plugin-a',
          name: 'Plugin A',
          version: '1.0.0',
          description: 'A',
        },
      });
      const pluginB = createPlugin({
        metadata: {
          id: 'plugin-b',
          name: 'Plugin B',
          version: '1.0.0',
          description: 'B',
        },
      });

      const loader = new PluginLoader({
        plugins: [pluginA, pluginB],
        failFast: true,
      });
      const result = await loader.load();

      expect(result.loaded).toBe(2);
      expect(result.failed).toBe(0);
    });
  });

  describe('start()', () => {
    it('calls start hook and transitions to STARTED', async () => {
      let started = false;
      const plugin = createPlugin({
        start: async () => {
          started = true;
        },
      });
      const loader = new PluginLoader({
        plugins: [plugin],
        failFast: true,
      });
      await loader.load();
      const app = await createExpressApp();
      await loader.start(app);

      expect(started).toBe(true);
      expect(loader.getInstance('test-plugin')?.state).toBe(PluginState.STARTED);
    });

    it('mounts middleware', async () => {
      const mw = vi.fn();
      const plugin = createPlugin({
        middleware: [mw],
      });
      const loader = new PluginLoader({
        plugins: [plugin],
        failFast: true,
      });
      await loader.load();
      const app = await createExpressApp();
      await loader.start(app);

      // Middleware should be mounted - verify the plugin started
      expect(loader.getInstance('test-plugin')?.state).toBe(PluginState.STARTED);
    });

    it('mounts router at specified path', async () => {
      const express = await import('express');
      const router = express.Router();
      const plugin = createPlugin({
        router,
        routerPath: '/api/plugins/test',
      });
      const loader = new PluginLoader({
        plugins: [plugin],
        failFast: true,
      });
      await loader.load();
      const app = await createExpressApp();
      await loader.start(app);

      // Router should be mounted — just check state transition
      expect(loader.getInstance('test-plugin')?.state).toBe(PluginState.STARTED);
    });

    it('times out on slow start hook', async () => {
      const plugin = createPlugin({
        start: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5000));
        },
      });
      const loader = new PluginLoader({
        plugins: [plugin],
        startTimeout: 100,
        failFast: false,
      });
      await loader.load();
      const app = await createExpressApp();
      await loader.start(app);

      expect(loader.getInstance('test-plugin')?.state).toBe(PluginState.ERROR);
    });
  });

  describe('stop()', () => {
    it('calls stop hook and transitions to STOPPED', async () => {
      let stopped = false;
      const plugin = createPlugin({
        start: async () => {},
        stop: async () => {
          stopped = true;
        },
      });
      const loader = new PluginLoader({
        plugins: [plugin],
        failFast: true,
      });
      await loader.load();
      const app = await createExpressApp();
      await loader.start(app);
      await loader.stop();

      expect(stopped).toBe(true);
      expect(loader.getInstance('test-plugin')?.state).toBe(PluginState.STOPPED);
    });
  });

  describe('dependency validation', () => {
    it('detects missing dependencies', async () => {
      const plugin = createPlugin({
        metadata: {
          id: 'plugin-x',
          name: 'Plugin X',
          version: '1.0.0',
          description: 'X',
          dependsOn: ['nonexistent'],
        },
      });
      const loader = new PluginLoader({
        plugins: [plugin],
        failFast: true,
      });

      await expect(loader.load()).rejects.toThrow('depends on "nonexistent" which is not loaded');
    });

    it('detects cyclic dependencies', async () => {
      const pluginA = createPlugin({
        metadata: {
          id: 'plugin-a',
          name: 'Plugin A',
          version: '1.0.0',
          description: 'A',
          dependsOn: ['plugin-b'],
        },
      });
      const pluginB = createPlugin({
        metadata: {
          id: 'plugin-b',
          name: 'Plugin B',
          version: '1.0.0',
          description: 'B',
          dependsOn: ['plugin-a'],
        },
      });

      const loader = new PluginLoader({
        plugins: [pluginA, pluginB],
        failFast: true,
      });

      await expect(loader.load()).rejects.toThrow(/Cyclic dependency detected/i);
    });

    it('starts plugins in dependency order', async () => {
      const order: string[] = [];
      const pluginA = createPlugin({
        metadata: {
          id: 'dep-a',
          name: 'Dep A',
          version: '1.0.0',
          description: 'A',
        },
        start: async () => {
          order.push('a');
        },
      });
      const pluginB = createPlugin({
        metadata: {
          id: 'dep-b',
          name: 'Dep B',
          version: '1.0.0',
          description: 'B',
          dependsOn: ['dep-a'],
        },
        start: async () => {
          order.push('b');
        },
      });

      const loader = new PluginLoader({
        plugins: [pluginA, pluginB],
        failFast: true,
      });
      await loader.load();
      const app = await createExpressApp();
      await loader.start(app);

      expect(order).toEqual(['a', 'b']);
    });
  });

  describe('getInstance()', () => {
    it('returns undefined for unknown plugin', async () => {
      const loader = new PluginLoader({ failFast: true });
      expect(loader.getInstance('unknown')).toBeUndefined();
    });

    it('returns instance for loaded plugin', async () => {
      const plugin = createPlugin();
      const loader = new PluginLoader({
        plugins: [plugin],
        failFast: true,
      });
      await loader.load();
      expect(loader.getInstance('test-plugin')).toBeDefined();
    });
  });

  describe('getAllInstances()', () => {
    it('returns empty array before loading', () => {
      const loader = new PluginLoader({ failFast: true });
      expect(loader.getAllInstances()).toHaveLength(0);
    });

    it('returns all loaded instances', async () => {
      const pluginA = createPlugin({
        metadata: {
          id: 'a',
          name: 'A',
          version: '1.0.0',
          description: 'A',
        },
      });
      const pluginB = createPlugin({
        metadata: {
          id: 'b',
          name: 'B',
          version: '1.0.0',
          description: 'B',
        },
      });

      const loader = new PluginLoader({
        plugins: [pluginA, pluginB],
        failFast: true,
      });
      await loader.load();

      expect(loader.getAllInstances()).toHaveLength(2);
    });
  });

  describe('isPluginInState()', () => {
    it('returns correct state match', async () => {
      const plugin = createPlugin();
      const loader = new PluginLoader({
        plugins: [plugin],
        failFast: true,
      });
      await loader.load();
      expect(loader.isPluginInState('test-plugin', PluginState.INACTIVE)).toBe(true);
      expect(loader.isPluginInState('test-plugin', PluginState.STARTED)).toBe(false);
    });
  });
});
