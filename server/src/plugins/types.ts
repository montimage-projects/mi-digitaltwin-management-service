/**
 * Plugin system types and interfaces for the Digital Twin Management Platform.
 *
 * Plugins extend server capabilities through a well-defined lifecycle:
 *   register → validate → start → (runtime) → stop
 *
 * Each plugin declares its metadata, lifecycle hooks, and optional
 * dependency graph so the loader can resolve ordering.
 */

// ---------------------------------------------------------------------------
// Lifecycle hooks
// ---------------------------------------------------------------------------

/**
 * Called once when the plugin is first registered. Use for static
 * validation, schema checks, or preparing plugin configuration.
 */
export type PluginRegisterHook = () => Promise<void>;

/**
 * Called after the database connection is established and routes are
 * mounted. This is the right place for async initialisation (e.g.
 * seeding data, warming caches).
 */
export type PluginStartHook = () => Promise<void>;

/**
 * Called during graceful shutdown. Clean up connections, timers,
 * or temporary files. Should be idempotent.
 */
export type PluginStopHook = () => Promise<void>;

// ---------------------------------------------------------------------------
// Plugin metadata
// ---------------------------------------------------------------------------

/**
 * Unique identifier for a plugin. Must be kebab-case, globally unique
 * across the platform.
 */
export type PluginId = string;

/**
 * Semantic version string (semver) for the plugin.
 */
export type PluginVersion = string;

/**
 * Plugin metadata — declared once at creation time.
 */
export interface PluginMetadata {
  /** Unique plugin identifier (kebab-case). */
  id: PluginId;
  /** Human-readable name. */
  name: string;
  /** Semantic version (e.g. "1.0.0"). */
  version: PluginVersion;
  /** Short description of what the plugin does. */
  description: string;
  /** Author or team responsible for this plugin. */
  author?: string;
  /** List of other plugin ids this plugin depends on. */
  dependsOn?: PluginId[];
  /** License identifier (SPDX format). */
  license?: string;
}

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

/**
 * A plugin is a self-contained unit of functionality. It declares its
 * metadata, lifecycle hooks, and optional Express middleware / routes.
 */
export interface Plugin {
  /** Plugin metadata. */
  metadata: PluginMetadata;
  /** Optional — called during registration phase. */
  register?: PluginRegisterHook;
  /** Optional — called after DB is connected. */
  start?: PluginStartHook;
  /** Optional — called during graceful shutdown. */
  stop?: PluginStopHook;
  /** Optional — Express middleware to add to the app pipeline. */
  middleware?: import('express').RequestHandler[];
  /** Optional — Express router to mount under a custom path. */
  router?: import('express').Router;
  /** Optional — path prefix under which the router is mounted. */
  routerPath?: string;
}

// ---------------------------------------------------------------------------
// Plugin state
// ---------------------------------------------------------------------------

/**
 * Lifecycle state of a loaded plugin.
 */
export enum PluginState {
  /** Plugin has been instantiated but not yet registered. */
  INACTIVE = 'inactive',
  /** Plugin has been registered (register hook called). */
  REGISTERED = 'registered',
  /** Plugin has been started (start hook called). */
  STARTED = 'started',
  /** Plugin has been stopped (stop hook called). */
  STOPPED = 'stopped',
  /** Plugin encountered an error. */
  ERROR = 'error',
}

/**
 * Runtime state of a loaded plugin.
 */
export interface PluginInstance {
  /** The plugin definition. */
  plugin: Plugin;
  /** Current lifecycle state. */
  state: PluginState;
  /** Error message if state is ERROR. */
  error?: string;
  /** Timestamp when the plugin was loaded. */
  loadedAt: Date;
}

// ---------------------------------------------------------------------------
// Plugin loader configuration
// ---------------------------------------------------------------------------

/**
 * Configuration options for the plugin loader.
 */
export interface PluginLoaderConfig {
  /** Base directory to scan for plugins (auto-discovery mode). */
  pluginDir?: string;
  /** Explicit list of plugins to load (overrides auto-discovery). */
  plugins?: Plugin[];
  /** Whether to fail fast on a single plugin error. */
  failFast?: boolean;
  /** Minimum timeout (ms) for a plugin start hook. */
  startTimeout?: number;
}

// ---------------------------------------------------------------------------
// Plugin loader result
// ---------------------------------------------------------------------------

/**
 * Result returned after loading all plugins.
 */
export interface PluginLoadResult {
  /** Number of plugins loaded successfully. */
  loaded: number;
  /** Number of plugins that failed to load. */
  failed: number;
  /** List of successfully loaded plugin instances. */
  plugins: PluginInstance[];
  /** List of errors encountered during loading. */
  errors: PluginLoadError[];
}

/**
 * Error captured during plugin loading.
 */
export interface PluginLoadError {
  /** The plugin id that failed. */
  pluginId: PluginId;
  /** Human-readable error message. */
  message: string;
  /** The underlying Error object, if available. */
  cause?: Error;
}
