import { describe, it, expect } from 'vitest';
import {
  effectiveArgs,
  effectiveConfigFiles,
  effectiveEnv,
  nodeConfigOf,
  pruneConfig,
  removeConfigFile,
  removeEnvOverride,
  upsertConfigFile,
  upsertEnvOverride,
  type CatalogDeployment,
} from './node-config';

const deployment: CatalogDeployment = {
  env: [
    { name: 'HOST_INTERFACE', value: 'eth0' },
    { name: 'TARGET_URL', fromEdge: 'target' },
  ],
  args: ['probe', '-i', 'eth0'],
  configFiles: [{ mountPath: '/opt/mmt/probe/mmt-probe.conf', content: 'security = {};' }],
};

describe('nodeConfigOf', () => {
  it('returns {} when the node has no config', () => {
    expect(nodeConfigOf(null)).toEqual({});
    expect(nodeConfigOf({ id: 'n1' })).toEqual({});
    expect(nodeConfigOf({ id: 'n1', data: {} })).toEqual({});
  });

  it('returns {} for a non-object config', () => {
    expect(nodeConfigOf({ id: 'n1', data: { config: 'env' } })).toEqual({});
    expect(nodeConfigOf({ id: 'n1', data: { config: [1] } })).toEqual({});
  });

  it('drops malformed env/args/configFiles but preserves unknown keys', () => {
    const config = nodeConfigOf({
      id: 'n1',
      data: { config: { env: 'oops', args: [1], configFiles: {}, custom: 7 } },
    });
    expect(config.env).toBeUndefined();
    expect(config.configFiles).toBeUndefined();
    expect(config.args).toEqual([1]);
    expect(config.custom).toBe(7);
  });
});

describe('effectiveEnv', () => {
  it('returns catalog entries as un-overridden defaults', () => {
    const rows = effectiveEnv(deployment, {});
    expect(rows).toEqual([
      { name: 'HOST_INTERFACE', value: 'eth0', source: 'catalog', overridden: false },
      { name: 'TARGET_URL', fromEdge: 'target', source: 'catalog', overridden: false },
    ]);
  });

  it('replaces a catalog entry in place when a same-named override exists', () => {
    const rows = effectiveEnv(deployment, {
      env: [{ name: 'HOST_INTERFACE', value: 'eth1' }],
    });
    expect(rows[0]).toEqual({
      name: 'HOST_INTERFACE',
      value: 'eth1',
      source: 'catalog',
      overridden: true,
    });
    expect(rows[1].overridden).toBe(false);
  });

  it('appends node-only entries after the catalog list', () => {
    const rows = effectiveEnv(deployment, { env: [{ name: 'EXTRA', value: '1' }] });
    expect(rows).toHaveLength(3);
    expect(rows[2]).toEqual({ name: 'EXTRA', value: '1', source: 'added', overridden: false });
  });

  it('returns only node entries when there is no catalog spec', () => {
    const rows = effectiveEnv(undefined, { env: [{ name: 'A', value: 'b' }] });
    expect(rows).toEqual([{ name: 'A', value: 'b', source: 'added', overridden: false }]);
  });
});

describe('upsertEnvOverride / removeEnvOverride', () => {
  it('appends a new override', () => {
    const next = upsertEnvOverride({}, { name: 'X', value: '1' });
    expect(next.env).toEqual([{ name: 'X', value: '1' }]);
  });

  it('replaces an existing override by name without duplicating', () => {
    const config = { env: [{ name: 'X', value: '1' }] };
    const next = upsertEnvOverride(config, { name: 'X', value: '2' });
    expect(next.env).toEqual([{ name: 'X', value: '2' }]);
  });

  it('removeEnvOverride drops the key when the last entry goes', () => {
    const next = removeEnvOverride({ env: [{ name: 'X', value: '1' }] }, 'X');
    expect(next.env).toBeUndefined();
  });
});

describe('effectiveArgs', () => {
  it('returns catalog args when no override is set', () => {
    expect(effectiveArgs(deployment, {})).toEqual({
      args: ['probe', '-i', 'eth0'],
      overridden: false,
    });
  });

  it('returns the node override wholesale, including an empty list', () => {
    expect(effectiveArgs(deployment, { args: ['mag', 'synflood'] })).toEqual({
      args: ['mag', 'synflood'],
      overridden: true,
    });
    expect(effectiveArgs(deployment, { args: [] })).toEqual({ args: [], overridden: true });
  });
});

describe('effectiveConfigFiles', () => {
  it('returns catalog files as defaults', () => {
    const rows = effectiveConfigFiles(deployment, {});
    expect(rows).toEqual([
      {
        mountPath: '/opt/mmt/probe/mmt-probe.conf',
        content: 'security = {};',
        source: 'catalog',
        overridden: false,
      },
    ]);
  });

  it('replaces catalog content by mountPath and appends node-only files', () => {
    const rows = effectiveConfigFiles(deployment, {
      configFiles: [
        { mountPath: '/opt/mmt/probe/mmt-probe.conf', content: 'tuned = true;' },
        { mountPath: '/opt/extra.conf', content: 'x' },
      ],
    });
    expect(rows[0]).toMatchObject({ content: 'tuned = true;', overridden: true });
    expect(rows[1]).toMatchObject({ mountPath: '/opt/extra.conf', source: 'added' });
  });
});

describe('upsertConfigFile / removeConfigFile', () => {
  it('upserts by mountPath and removes cleanly', () => {
    let config = upsertConfigFile({}, { mountPath: '/a', content: '1' });
    config = upsertConfigFile(config, { mountPath: '/a', content: '2' });
    expect(config.configFiles).toEqual([{ mountPath: '/a', content: '2' }]);
    const next = removeConfigFile(config, '/a');
    expect(next.configFiles).toBeUndefined();
  });
});

describe('pruneConfig', () => {
  it('returns undefined when nothing remains', () => {
    expect(pruneConfig({})).toBeUndefined();
    expect(pruneConfig({ env: [] })).toBeUndefined();
    expect(pruneConfig({ configFiles: [] })).toBeUndefined();
  });

  it('keeps a meaningful empty args override and unknown keys', () => {
    expect(pruneConfig({ args: [] })).toEqual({ args: [] });
    expect(pruneConfig({ env: [], custom: true })).toEqual({ custom: true });
  });
});
