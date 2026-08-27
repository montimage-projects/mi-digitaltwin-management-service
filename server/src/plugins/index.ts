/**
 * Plugin system — public API.
 *
 * Export all types and the PluginLoader class so consumers can
 * build, load, and manage plugins.
 */

export { PluginLoader } from './loader.js';
export type {
  Plugin,
  PluginId,
  PluginInstance,
  PluginLoadError,
  PluginLoadResult,
  PluginLoaderConfig,
  PluginMetadata,
  PluginRegisterHook,
  PluginStartHook,
  PluginState,
  PluginStopHook,
  PluginVersion,
} from './types.js';

export { PluginState as PluginStateEnum } from './types.js';
