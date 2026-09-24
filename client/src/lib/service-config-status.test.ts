import { describe, it, expect } from 'vitest';
import {
  getServiceConfigStatus,
  resolveDeployableImage,
  REQUIRED_SERVICE_FIELDS,
  type ServiceConfigInput,
} from './service-config-status';

const complete = (overrides: Partial<ServiceConfigInput> = {}): ServiceConfigInput => ({
  title: 'Network Monitor',
  provider: 'Montimage',
  categoryId: { _id: 'cat-1' },
  description: 'Monitors network traffic.',
  currentVersion: '1.1.0',
  versions: [
    { version: '1.0.0', dockerImage: 'registry/mmt:1.0.0' },
    { version: '1.1.0', dockerImage: 'registry/mmt:1.1.0' },
  ],
  ...overrides,
});

describe('getServiceConfigStatus', () => {
  it('reports a fully configured service as complete', () => {
    expect(getServiceConfigStatus(complete())).toEqual({ state: 'complete', missing: [] });
  });

  it.each([
    ['Title', { title: '' }],
    ['Title', { title: '   ' }],
    ['Provider', { provider: '' }],
    ['Category', { categoryId: undefined }],
    ['Category', { categoryId: null }],
    ['Description', { description: undefined }],
    ['Description', { description: '  \n ' }],
  ] as const)('flags missing %s (%j)', (label, overrides) => {
    expect(getServiceConfigStatus(complete(overrides))).toEqual({
      state: 'incomplete',
      missing: [label],
    });
  });

  it('flags a missing container image when versions is undefined', () => {
    const status = getServiceConfigStatus(complete({ versions: undefined }));
    expect(status).toEqual({ state: 'incomplete', missing: ['Container image'] });
  });

  it('flags a missing container image when versions is empty', () => {
    const status = getServiceConfigStatus(complete({ versions: [] }));
    expect(status).toEqual({ state: 'incomplete', missing: ['Container image'] });
  });

  it('flags a whitespace-only docker image on the current version', () => {
    const status = getServiceConfigStatus(
      complete({
        currentVersion: '1.0.0',
        versions: [
          { version: '1.0.0', dockerImage: '   ' },
          { version: '1.1.0', dockerImage: 'registry/mmt:1.1.0' },
        ],
      })
    );
    expect(status.missing).toEqual(['Container image']);
  });

  it('uses the current version image, not the last one', () => {
    const status = getServiceConfigStatus(
      complete({
        currentVersion: '1.0.0',
        versions: [
          { version: '1.0.0', dockerImage: 'registry/mmt:1.0.0' },
          { version: '1.1.0', dockerImage: '' },
        ],
      })
    );
    expect(status.state).toBe('complete');
  });

  it('falls back to the last version when currentVersion is not listed (image present)', () => {
    const status = getServiceConfigStatus(
      complete({
        currentVersion: '9.9.9',
        versions: [
          { version: '1.0.0', dockerImage: '' },
          { version: '1.1.0', dockerImage: 'registry/mmt:1.1.0' },
        ],
      })
    );
    expect(status.state).toBe('complete');
  });

  it('falls back to the last version when currentVersion is not listed (image missing)', () => {
    const status = getServiceConfigStatus(
      complete({
        currentVersion: '9.9.9',
        versions: [
          { version: '1.0.0', dockerImage: 'registry/mmt:1.0.0' },
          { version: '1.1.0', dockerImage: '' },
        ],
      })
    );
    expect(status.missing).toEqual(['Container image']);
  });

  it('lists every missing requirement in declaration order', () => {
    const status = getServiceConfigStatus({});
    expect(status.state).toBe('incomplete');
    expect(status.missing).toEqual(REQUIRED_SERVICE_FIELDS.map((r) => r.label));
    expect(status.missing).toEqual([
      'Title',
      'Provider',
      'Category',
      'Description',
      'Container image',
    ]);
  });
});

describe('resolveDeployableImage', () => {
  it('falls back to the last version when currentVersion is unset', () => {
    expect(resolveDeployableImage(complete({ currentVersion: undefined }))).toBe(
      'registry/mmt:1.1.0'
    );
  });

  it('returns undefined when there are no versions', () => {
    expect(resolveDeployableImage(complete({ versions: null }))).toBeUndefined();
  });
});
