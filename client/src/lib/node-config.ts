/**
 * Per-node config overrides for the topology editor — task 3.3 of the
 * Montimage attack→detect→respond plan
 * (docs/playbooks/montimage-attack-detect-respond-plan.md).
 *
 * Mirrors `INodeConfig` in `server/src/models/Scenario.ts` (task 0.4): the
 * scenario routes validate `config.env`/`config.args` on save and preserve
 * unknown keys (e.g. `configFiles`) untouched, while the deploy engine
 * (`server/src/services/kubernetesDeploy.ts`) merges `env` by name over the
 * catalog `deployment.env` and replaces `args` wholesale.
 *
 * Every helper is pure: it returns a new config object and never mutates.
 */
import type { ServiceDeployment } from './services';

/** One `config.env` entry — mirrors the server-side env override shape. */
export interface NodeConfigEnv {
  name: string;
  value?: string;
  fromEdge?: 'target' | 'reaction';
}

/** One `config.configFiles` entry — a file rendered into the node's ConfigMap. */
export interface NodeConfigFile {
  mountPath: string;
  content: string;
}

/**
 * Per-node override document persisted at `node.data.config`. Unknown keys
 * are preserved (the server validates with a loose object) so helpers here
 * always spread the existing config instead of rebuilding it.
 */
export interface NodeConfig {
  env?: NodeConfigEnv[];
  args?: string[];
  configFiles?: NodeConfigFile[];
  [key: string]: unknown;
}

/** Structural view of the catalog deployment spec the panel needs. */
export type CatalogDeployment = Pick<ServiceDeployment, 'env' | 'args' | 'configFiles'>;

/** Structural view of a topology node carrying a config document. */
export interface ConfigurableNode {
  id: string;
  data?: { config?: unknown; [key: string]: unknown };
}

/**
 * Read `node.data.config`, tolerating absent or malformed payloads: a
 * non-object config reads as `{}`, and `env`/`args`/`configFiles` keys that
 * are not arrays are dropped rather than trusted.
 */
export function nodeConfigOf(node: ConfigurableNode | null | undefined): NodeConfig {
  const config = node?.data?.config;
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
  const next = { ...(config as NodeConfig) };
  if (!Array.isArray(next.env)) delete next.env;
  if (!Array.isArray(next.args)) delete next.args;
  if (!Array.isArray(next.configFiles)) delete next.configFiles;
  return next;
}

/** One env row as the panel renders it: effective value plus its provenance. */
export interface EnvRow extends NodeConfigEnv {
  /** `catalog` rows come from `deployment.env`; `added` rows exist only on the node. */
  source: 'catalog' | 'added';
  /** True when a `config.env` entry replaces this catalog row. */
  overridden: boolean;
}

/**
 * Effective env list — catalog `deployment.env` entries in order, each
 * replaced in place by a same-named `config.env` override (mirroring
 * `mergeEnvByName` in the deploy engine), then node-only entries appended.
 */
export function effectiveEnv(
  deployment: CatalogDeployment | undefined,
  config: NodeConfig | undefined
): EnvRow[] {
  const catalog = deployment?.env ?? [];
  const overrides = config?.env ?? [];
  const rows: EnvRow[] = catalog.map((entry) => {
    const override = overrides.find((o) => o.name === entry.name);
    return override
      ? { ...override, source: 'catalog' as const, overridden: true }
      : { ...entry, source: 'catalog' as const, overridden: false };
  });
  for (const override of overrides) {
    if (!catalog.some((entry) => entry.name === override.name)) {
      rows.push({ ...override, source: 'added' as const, overridden: false });
    }
  }
  return rows;
}

/** Upsert an env override into `config.env` (replace by name, else append). */
export function upsertEnvOverride(config: NodeConfig, entry: NodeConfigEnv): NodeConfig {
  const env = [...(config.env ?? [])];
  const idx = env.findIndex((e) => e.name === entry.name);
  if (idx >= 0) {
    env[idx] = entry;
  } else {
    env.push(entry);
  }
  return { ...config, env };
}

/**
 * Remove an env override by name. Deleting the last entry drops the `env`
 * key entirely so the config document stays minimal.
 */
export function removeEnvOverride(config: NodeConfig, name: string): NodeConfig {
  const env = (config.env ?? []).filter((e) => e.name !== name);
  const next = { ...config };
  if (env.length) next.env = env;
  else delete next.env;
  return next;
}

/** Effective args — the node override when set, else the catalog list. */
export function effectiveArgs(
  deployment: CatalogDeployment | undefined,
  config: NodeConfig | undefined
): { args: string[]; overridden: boolean } {
  if (config?.args !== undefined) return { args: config.args, overridden: true };
  return { args: deployment?.args ?? [], overridden: false };
}

/** One config file as the panel renders it: effective content + provenance. */
export interface ConfigFileRow extends NodeConfigFile {
  /** `catalog` rows come from `deployment.configFiles`; `added` rows exist only on the node. */
  source: 'catalog' | 'added';
  /** True when a `config.configFiles` entry replaces this catalog file. */
  overridden: boolean;
}

/**
 * Effective config-file list — catalog `deployment.configFiles` in order,
 * each replaced in place by a same-`mountPath` node entry, then node-only
 * files appended. The deploy engine persists but does not yet consume
 * `config.configFiles`; the merge-by-mountPath semantics mirror `env`.
 */
export function effectiveConfigFiles(
  deployment: CatalogDeployment | undefined,
  config: NodeConfig | undefined
): ConfigFileRow[] {
  const catalog = deployment?.configFiles ?? [];
  const overrides = config?.configFiles ?? [];
  const rows: ConfigFileRow[] = catalog.map((entry) => {
    const override = overrides.find((o) => o.mountPath === entry.mountPath);
    return override
      ? { ...override, source: 'catalog' as const, overridden: true }
      : { ...entry, source: 'catalog' as const, overridden: false };
  });
  for (const override of overrides) {
    if (!catalog.some((entry) => entry.mountPath === override.mountPath)) {
      rows.push({ ...override, source: 'added' as const, overridden: false });
    }
  }
  return rows;
}

/** Upsert a config-file override into `config.configFiles` (by `mountPath`). */
export function upsertConfigFile(config: NodeConfig, file: NodeConfigFile): NodeConfig {
  const configFiles = [...(config.configFiles ?? [])];
  const idx = configFiles.findIndex((f) => f.mountPath === file.mountPath);
  if (idx >= 0) {
    configFiles[idx] = file;
  } else {
    configFiles.push(file);
  }
  return { ...config, configFiles };
}

/**
 * Remove a config-file entry by `mountPath`. Deleting the last entry drops
 * the `configFiles` key entirely.
 */
export function removeConfigFile(config: NodeConfig, mountPath: string): NodeConfig {
  const configFiles = (config.configFiles ?? []).filter((f) => f.mountPath !== mountPath);
  const next = { ...config };
  if (configFiles.length) next.configFiles = configFiles;
  else delete next.configFiles;
  return next;
}

/**
 * Strip empty `env`/`configFiles` arrays, then return `undefined` when no
 * keys remain — the node's `data.config` is removed rather than persisted
 * as an empty object. `args: []` is kept: it is a meaningful override (the
 * container runs with no arguments). Unknown keys are preserved.
 */
export function pruneConfig(config: NodeConfig): NodeConfig | undefined {
  const next = { ...config };
  if (Array.isArray(next.env) && next.env.length === 0) delete next.env;
  if (Array.isArray(next.configFiles) && next.configFiles.length === 0) delete next.configFiles;
  return Object.keys(next).length === 0 ? undefined : next;
}
