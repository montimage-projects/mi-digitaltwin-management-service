import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Category } from '../../models/Category.js';
import { Sector } from '../../models/Sector.js';
import { Service } from '../../models/Service.js';
import { seedServices } from '../services.seed.js';

vi.mock('../../models/Category.js', () => ({
  Category: { find: vi.fn() },
}));
vi.mock('../../models/Sector.js', () => ({
  Sector: { find: vi.fn() },
}));
vi.mock('../../models/Service.js', () => ({
  Service: {
    findOne: vi.fn(),
    create: vi.fn(),
    updateOne: vi.fn(),
    updateMany: vi.fn(),
  },
}));

/**
 * Unit tests for `seedServices()` covering issue #186 — the four Montimage
 * attack→detect→respond scenario modules must be seeded with the image
 * references confirmed in playbook task Pre.1
 * (docs/playbooks/montimage-attack-detect-respond-plan.md), not the synthetic
 * `registry.montimage.eu/<provider-slug>/<shortName>:v1.0.0` fallback.
 *
 * The Mongoose models are mocked (no MongoDB required): every service reads
 * as not-yet-seeded so `seedServices()` takes the `created` path, which is
 * where the initial `versions[0].dockerImage` is written via
 * `Service.updateOne`.
 */

const CATEGORY_SLUGS = [
  'dev-services',
  'ops-services',
  // Scenario role categories added by task 0.2 (issue #187).
  'attack',
  'target',
  'monitor',
  'reaction',
  '5g-testbeds',
  'hpc-compute',
  'manufacturing-labs',
  'data-center-hosting',
  'energy-grid-infrastructure',
  'devsecops-platforms',
  'healthcare-iot-platforms',
  'e-mobility-iiot',
];

const SECTOR_SLUGS = [
  'digital-infrastructure',
  'manufacturing',
  'energy',
  'health',
  'ict-service-management-b2b',
  'research',
];

const MONTIMAGE_IMAGES: Record<string, string> = {
  MAG: 'registry.montimage.eu/montimage-mti/mag:v1.0.0',
  'HTTP-SIM': 'registry.montimage.eu/montimage-mti/http-sim:v1.0.0',
  'MMT-PROBE': 'registry.montimage.eu/montimage-mti/mmt-probe:v1.0.0',
  AI4SOAR: 'registry.montimage.eu/montimage-mti/ai4soar:v1.0.0',
};

/**
 * Scenario role categories assigned by task 0.2 (issue #187) — they drive
 * node badges and edge validation in the client.
 */
const MONTIMAGE_ROLE_CATEGORIES: Record<string, string> = {
  MAG: 'attack',
  'HTTP-SIM': 'target',
  'MMT-PROBE': 'monitor',
  AI4SOAR: 'reaction',
};

type VersionSet = {
  $set: {
    currentVersion: string;
    versions: { version: string; dockerImage: string }[];
  };
};

/** Extracts `Service.updateOne` calls as [filter, update] pairs. */
function versionUpdates(): [Record<string, unknown>, VersionSet][] {
  return vi.mocked(Service.updateOne).mock.calls as unknown as [
    Record<string, unknown>,
    VersionSet,
  ][];
}

function updateFor(shortName: string): VersionSet | undefined {
  return versionUpdates().find(([filter]) => filter.shortName === shortName)?.[1];
}

describe('seedServices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Category.find).mockResolvedValue(
      CATEGORY_SLUGS.map((slug) => ({ _id: `cat-${slug}`, slug })) as never
    );
    vi.mocked(Sector.find).mockResolvedValue(
      SECTOR_SLUGS.map((slug) => ({ _id: `sec-${slug}`, slug })) as never
    );
    // `.lean()` chainable, resolving null → upsertRecord reports 'created'
    // for every seed entry, so each gets the initial-version updateOne.
    vi.mocked(Service.findOne).mockReturnValue({
      lean: () => Promise.resolve(null),
    } as never);
    vi.mocked(Service.create).mockImplementation(async (doc) => doc as never);
    vi.mocked(Service.updateOne).mockResolvedValue({ modifiedCount: 1 } as never);
    vi.mocked(Service.updateMany).mockResolvedValue({ modifiedCount: 0 } as never);
  });

  it('seeds the four Montimage scenario services with their confirmed Pre.1 images', async () => {
    await seedServices();

    for (const [shortName, image] of Object.entries(MONTIMAGE_IMAGES)) {
      const update = updateFor(shortName);
      expect(update, `${shortName} initial-version update`).toBeDefined();
      expect(update?.$set.currentVersion).toBe('1.0.0');
      expect(update?.$set.versions).toHaveLength(1);
      expect(update?.$set.versions[0].dockerImage).toBe(image);
    }
  });

  it('never writes the synthetic fallback image for the four services', async () => {
    await seedServices();

    for (const shortName of Object.keys(MONTIMAGE_IMAGES)) {
      const update = updateFor(shortName);
      // The synthetic shape for provider "Montimage (MTI)" is
      // `registry.montimage.eu/montimage-mti-/<shortName>:v1.0.0` — note the
      // slug's trailing dash, which none of the confirmed refs may carry.
      expect(update?.$set.versions[0].dockerImage).not.toMatch(/montimage-mti-\//);
    }
  });

  it('creates the four services under Montimage (MTI) in INTACT_TOOLBOX', async () => {
    await seedServices();

    const creates = vi.mocked(Service.create).mock.calls.map(([doc]) => doc) as {
      shortName: string;
      provider: string;
      repositoryTable: string;
      categoryId: string;
    }[];

    for (const shortName of Object.keys(MONTIMAGE_IMAGES)) {
      const doc = creates.find((d) => d.shortName === shortName);
      expect(doc, `${shortName} create call`).toBeDefined();
      expect(doc?.provider).toBe('Montimage (MTI)');
      expect(doc?.repositoryTable).toBe('INTACT_TOOLBOX');
      // Task 0.2 (issue #187): each module is assigned to its role category.
      expect(doc?.categoryId).toBe(`cat-${MONTIMAGE_ROLE_CATEGORIES[shortName]}`);
    }
  });

  it('keeps the synthetic fallback for services without an explicit dockerImage', async () => {
    await seedServices();

    const csam = updateFor('CSAM');
    expect(csam).toBeDefined();
    expect(csam?.$set.versions[0].dockerImage).toMatch(
      /^registry\.montimage\.eu\/.+\/csam:v1\.0\.0$/
    );
  });

  it('seeds a deployment spec on the four Montimage services (issue #188)', async () => {
    await seedServices();

    const creates = vi.mocked(Service.create).mock.calls.map(([doc]) => doc) as {
      shortName: string;
      uiType?: string;
      deployment?: {
        kind: string;
        role: string;
        attachMode?: string;
        exposePort?: boolean;
        containerPort?: number;
        command?: string[];
        args?: string[];
        startOrder?: number;
        securityContext?: { capabilities?: string[] };
        rbac?: { apiGroups: string[]; resources: string[]; verbs: string[] }[];
      };
    }[];
    const byName = (name: string) => creates.find((d) => d.shortName === name);

    // MAG — long-running terminal Deployment (issue #233): the pod idles on
    // a shell loop so attacks are driven via `kubectl exec` — no fixed args.
    const mag = byName('MAG');
    expect(mag?.uiType).toBe('terminal');
    expect(mag?.deployment).toMatchObject({
      kind: 'Deployment',
      role: 'attack',
      exposePort: false,
      startOrder: 30,
    });
    expect(mag?.deployment?.command).toEqual(['sh', '-c', 'while true; do sleep 3600; done']);
    expect(mag?.deployment?.args).toBeUndefined();

    // http-sim — victim workload serving HTTP on :8080.
    expect(byName('HTTP-SIM')?.deployment).toMatchObject({
      kind: 'Deployment',
      role: 'target',
      containerPort: 8080,
      exposePort: true,
    });

    // MMT-Probe — sidecar in the target pod, needs NET_ADMIN + NET_RAW.
    const probe = byName('MMT-PROBE')?.deployment;
    expect(probe).toMatchObject({
      kind: 'Deployment',
      role: 'monitor',
      attachMode: 'sidecar',
      exposePort: false,
    });
    expect(probe?.securityContext?.capabilities).toEqual(
      expect.arrayContaining(['NET_ADMIN', 'NET_RAW'])
    );

    // AI4SOAR — namespace-scoped RBAC rules for the reaction playbook.
    const soar = byName('AI4SOAR')?.deployment;
    expect(soar).toMatchObject({ kind: 'Deployment', role: 'reaction', containerPort: 5000 });
    expect(soar?.rbac).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resources: expect.arrayContaining(['pods']),
          verbs: expect.arrayContaining(['delete']),
        }),
      ])
    );

    // Non-scenario services carry no deployment spec.
    expect(byName('CSAM')?.deployment).toBeUndefined();
  });

  it('seeds CI-SIM under OTHER_SERVICES with the target deployment spec (issue #231)', async () => {
    await seedServices();

    // CI-SIM lives in the infrastructure list so the topology editor's
    // "Add Target" button (repositoryTable === 'OTHER_SERVICES') lists it,
    // grouped under the `target` role category.
    const creates = vi.mocked(Service.create).mock.calls.map(([doc]) => doc) as {
      shortName: string;
      provider: string;
      repositoryTable: string;
      categoryId: string;
      deployment?: {
        kind: string;
        role: string;
        containerPort?: number;
        exposePort?: boolean;
        readinessPath?: string;
        startOrder?: number;
      };
    }[];
    const ciSim = creates.find((d) => d.shortName === 'CI-SIM');
    expect(ciSim, 'CI-SIM create call').toBeDefined();
    expect(ciSim?.provider).toBe('Montimage (MTI)');
    expect(ciSim?.repositoryTable).toBe('OTHER_SERVICES');
    expect(ciSim?.categoryId).toBe('cat-target');
    expect(ciSim?.deployment).toMatchObject({
      kind: 'Deployment',
      role: 'target',
      containerPort: 8080,
      exposePort: true,
      readinessPath: '/',
    });

    // Initial version carries the confirmed image ref, not the synthetic
    // `registry.montimage.eu/montimage-mti-/ci-sim:v1.0.0` fallback (note the
    // slug's trailing dash).
    const update = updateFor('CI-SIM');
    expect(update?.$set.versions[0].dockerImage).toBe(
      'registry.montimage.eu/montimage-mti/ci-sim:v1.0.0'
    );
    expect(update?.$set.versions[0].dockerImage).not.toMatch(/montimage-mti-\//);
  });

  it('seeds the MMT-Probe config with JSON output on kafka, stdout and file (issue #234)', async () => {
    await seedServices();

    const creates = vi.mocked(Service.create).mock.calls.map(([doc]) => doc) as {
      shortName: string;
      deployment?: { configFiles?: { mountPath: string; content: string }[] };
    }[];
    const conf = creates
      .find((d) => d.shortName === 'MMT-PROBE')
      ?.deployment?.configFiles?.find((f) => f.mountPath.endsWith('mmt-probe.conf'));
    expect(conf, 'mmt-probe.conf configFiles entry').toBeDefined();

    // JSON report format — the contract the SSE alert parser and the
    // AI4SOAR playbook's `ip.src` extraction rely on.
    expect(conf?.content).toContain('format = "JSON";');
    // The multi-channel set, not a scalar, plus a gate block per channel.
    expect(conf?.content).toContain('output-channel = { kafka, stdout, file };');
    expect(conf?.content).toContain('kafka-output = {');
    expect(conf?.content).toContain('topic = "mmt-security-alerts";');
    expect(conf?.content).toContain('stdout-output = {');
    expect(conf?.content).toContain('file-output = {');
    // File output lands on the mounted mmt-reports volume (forensics).
    expect(conf?.content).toContain('/opt/mmt/probe/result/report');
  });

  it('seeds the AI4SOAR playbook blocking the alert ip.src via /admin/block (issue #235)', async () => {
    await seedServices();

    const creates = vi.mocked(Service.create).mock.calls.map(([doc]) => doc) as {
      shortName: string;
      deployment?: { configFiles?: { mountPath: string; content: string }[] };
    }[];
    const playbook = creates
      .find((d) => d.shortName === 'AI4SOAR')
      ?.deployment?.configFiles?.find((f) => f.mountPath.includes('playbooks'));
    expect(playbook, 'ai4soar playbook configFiles entry').toBeDefined();
    expect(playbook?.mountPath).toBe('/opt/ai4soar/playbooks/block-attacker.yaml');

    // The #234 → #235 contract: the attacker address is the report's ip.src,
    // posted to the acts-on target's application-level block endpoint.
    expect(playbook?.content).toContain('${alert.ip.src}');
    expect(playbook?.content).toContain('http://ci-sim:8080/admin/block');
    expect(playbook?.content).toContain('method: POST');
    // The pre-#235 NetworkPolicy response is retained as a variant.
    expect(playbook?.content).toContain('networkpolicy-hard-cut');
  });
});
