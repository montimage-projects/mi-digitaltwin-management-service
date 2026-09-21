import { describe, expect, it } from 'vitest';

/**
 * Regression test for the image signature gate fix (commit d24f7f1).
 *
 * container-sign at v1.2.4 emits three statuses: `signed`,
 * `signed-with-sbom` (when attest_sbom is on), and `dry-run`.
 * The original gate treated everything except exactly "signed" as unsigned,
 * so `signed-with-sbom` caused a false failure.
 *
 * This test validates the awk filter logic that accepts both signed forms
 * and fails closed on anything else.
 *
 * Closes: F-TEST-008
 */

describe('ci signature gate — signed-with-sbom acceptance', () => {
  /**
   * Reproduce the awk filter used in .gitlab-ci.yml:
   *   awk -F= '$1=="status" && $2!="signed" && $2!="signed-with-sbom" {c++} END {print c+0}'
   *
   * Returns the count of lines that would be counted as "unsigned".
   */
  const countUnsigned = (statusLines: string[]): number =>
    statusLines.filter((line) => {
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) return false;
      const key = line.slice(0, eqIdx);
      const value = line.slice(eqIdx + 1);
      return key === 'status' && value !== 'signed' && value !== 'signed-with-sbom';
    }).length;

  it('counts 0 unsigned when all images are signed-with-sbom', () => {
    // Regression: the old filter ($2!="signed") would count 2 unsigned.
    const statusLines = ['status=signed-with-sbom', 'status=signed-with-sbom'];
    expect(countUnsigned(statusLines)).toBe(0);
  });

  it('counts 0 unsigned when one is signed and one is signed-with-sbom', () => {
    const statusLines = ['status=signed', 'status=signed-with-sbom'];
    expect(countUnsigned(statusLines)).toBe(0);
  });

  it('counts 1 unsigned when one image is dry-run', () => {
    // dry-run should still fail closed
    const statusLines = ['status=signed', 'status=dry-run'];
    expect(countUnsigned(statusLines)).toBe(1);
  });

  it('counts 2 unsigned when both are dry-run', () => {
    const statusLines = ['status=dry-run', 'status=dry-run'];
    expect(countUnsigned(statusLines)).toBe(2);
  });

  it('counts 1 unsigned when one image is truly unsigned', () => {
    const statusLines = ['status=signed', 'status=unsigned'];
    expect(countUnsigned(statusLines)).toBe(1);
  });

  it('rejects any unknown status that is not signed or signed-with-sbom', () => {
    // Future-proof: any new status besides the two accepted forms fails closed
    const statusLines = ['status=signed', 'status=future-status'];
    expect(countUnsigned(statusLines)).toBe(1);
  });

  it('ignores non-status lines', () => {
    const statusLines = [
      'image=server',
      'status=signed',
      'repository=myregistry.io/server',
      'status=signed-with-sbom',
    ];
    expect(countUnsigned(statusLines)).toBe(0);
  });
});
