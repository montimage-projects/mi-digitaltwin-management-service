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
});
