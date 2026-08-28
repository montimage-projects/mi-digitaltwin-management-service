import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as yaml from 'js-yaml';

/**
 * Structural regression tests for the GitHub Actions CI gates.
 *
 * These tests keep the CI pipeline honest: the build job must depend on
 * tests, every matrix Node version must satisfy the engines floor, and
 * the dependency audit must be able to fail (no swallowed exit codes).
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

interface Workflow {
  jobs: Record<
    string,
    {
      needs?: string | string[];
      strategy?: { matrix?: { 'node-version'?: number[] | string[] } };
      steps?: Array<{ name?: string; run?: string; id?: string }>;
    }
  >;
}

const loadWorkflow = (): Workflow => {
  const raw = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8');
  return yaml.load(raw) as Workflow;
};

const nodeVersions = (workflow: Workflow): number[] =>
  Object.values(workflow.jobs).flatMap(
    (job) => (job.strategy?.matrix?.['node-version'] ?? []) as number[]
  );

const enginesFloor = (): number => {
  const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
    engines: { node: string };
  };
  const match = /(\d+)/.exec(pkg.engines.node);
  if (!match) throw new Error(`Unparseable engines.node: ${pkg.engines.node}`);
  return Number(match[1]);
};

describe('ci workflow gates', () => {
  it('build job requires the test job', () => {
    const workflow = loadWorkflow();
    const build = workflow.jobs.build;
    expect(build, 'ci.yml must define a build job').toBeDefined();

    const needs = Array.isArray(build.needs) ? build.needs : build.needs ? [build.needs] : [];
    expect(needs).toContain('test');
  });

  it('matrix node versions exclude EOL Node 18', () => {
    const versions = nodeVersions(loadWorkflow());
    expect(versions.length).toBeGreaterThan(0);
    expect(versions).not.toContain(18);
    expect(versions).not.toContain('18');
  });

  it('every matrix node version satisfies the engines floor', () => {
    const floor = enginesFloor();
    for (const version of nodeVersions(loadWorkflow())) {
      expect(Number(version)).toBeGreaterThanOrEqual(floor);
    }
  });

  it('dependency audit step can fail — no swallowed audit exit code', () => {
    const raw = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8');
    expect(raw).not.toMatch(/audit-level=moderate\s*\|\|\s*true/);

    const security = loadWorkflow().jobs.security;
    expect(security, 'ci.yml must define a security job').toBeDefined();
    const auditStep = (security.steps ?? []).find((step) =>
      step.name?.toLowerCase().includes('audit')
    );
    expect(auditStep?.run, 'audit step must have a run block').toBeDefined();

    const run = auditStep!.run as string;
    expect(run).toMatch(/npm audit --json/);
    expect(run).toMatch(/jq/);
    expect(run).toMatch(/exit 1/);
  });
});
