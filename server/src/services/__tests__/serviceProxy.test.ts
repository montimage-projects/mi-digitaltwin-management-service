import { describe, test, expect } from 'vitest';
import { PROXY_LINK_TTL_S, signProxyPath, verifyProxySignature } from '../serviceProxy.js';

const target = {
  scenarioId: 'a'.repeat(24),
  executionId: 'b'.repeat(24),
  service: 'ci-sim',
};

function parse(path: string) {
  const [, , , expires, sig] = path.split('/');
  return { expires: Number(expires), sig };
}

describe('service proxy links', () => {
  test('a minted link verifies for its own target until it expires', () => {
    const now = Date.now();
    const path = signProxyPath(target, now);
    expect(path).toMatch(/^\/api\/proxy\/\d+\/[A-Za-z0-9_-]+\/a{24}\/b{24}\/ci-sim\/$/);
    const { expires, sig } = parse(path);
    expect(verifyProxySignature(target, expires, sig, now)).toBe(true);
    expect(verifyProxySignature(target, expires, sig, now + (PROXY_LINK_TTL_S + 1) * 1000)).toBe(
      false
    );
  });

  test('a link does not verify for another service or a tampered expiry', () => {
    const { expires, sig } = parse(signProxyPath(target));
    expect(verifyProxySignature({ ...target, service: 'ai4soar' }, expires, sig)).toBe(false);
    expect(verifyProxySignature(target, expires + 60, sig)).toBe(false);
  });
});
