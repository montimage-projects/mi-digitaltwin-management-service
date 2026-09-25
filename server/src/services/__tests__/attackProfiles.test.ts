import { describe, test, expect } from 'vitest';
import { listAttackProfiles, profileScript, shellQuote } from '../attackProfiles.js';

describe('attack profiles', () => {
  test('lists well-formed profiles per node and skips malformed ones', () => {
    const profiles = listAttackProfiles([
      {
        id: 'mag',
        data: {
          config: {
            profiles: [
              { name: 'attack-1', description: 'flood', args: ['mag', 'http-flood'] },
              { name: 'no-args', args: [] },
              { name: 'bad-args', args: ['mag', 42] },
              { args: ['mag'] },
            ],
          },
        },
      },
      { id: 'ci-sim', data: { config: {} } },
      null,
    ]);
    expect(profiles).toEqual([
      { nodeId: 'mag', name: 'attack-1', description: 'flood', args: ['mag', 'http-flood'] },
    ]);
  });

  test('single-quotes every argument so stored args cannot inject shell', () => {
    expect(shellQuote("it's; rm -rf /")).toBe(`'it'\\''s; rm -rf /'`);
    expect(profileScript(['mag', 'http-flood', '--count', '25'])).toBe(
      "'mag' 'http-flood' '--count' '25' 2>&1 | tee /proc/1/fd/1"
    );
  });
});
