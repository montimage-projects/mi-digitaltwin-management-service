import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import mongoose from 'mongoose';
import { Category } from '../../models/Category.js';
import { Service } from '../../models/Service.js';
import { Sector } from '../../models/Sector.js';
import { seedSectors } from '../sectors.seed.js';
import { seedCategories } from '../categories.seed.js';
import { seedServices } from '../services.seed.js';

/**
 * Integration tests for the catalog refresh (issues #5, #6, #7).
 *
 * These connect to a real MongoDB instance using a dedicated, disposable
 * database — never the app's own `MONGODB_URI` (typically `.../intact`) —
 * so running this suite can never touch real deployment data. The database
 * is dropped in `afterAll`.
 *
 * Requires a MongoDB reachable at `mongodb://127.0.0.1:27017` (or
 * `SEED_TEST_MONGODB_URI` override). If unavailable, all tests in this file
 * are skipped rather than failing the whole suite.
 */

const TEST_DB_NAME = `secsim_seed_test_${Date.now()}`;
const TEST_MONGODB_URI =
  process.env.SEED_TEST_MONGODB_URI ?? `mongodb://127.0.0.1:27017/${TEST_DB_NAME}`;

let mongoAvailable = true;

beforeAll(async () => {
  try {
    await mongoose.connect(TEST_MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  } catch {
    mongoAvailable = false;
  }
});

afterAll(async () => {
  if (!mongoAvailable) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('seed catalog refresh (integration)', () => {
  test('seeds sectors, categories and services from a clean database', async () => {
    if (!mongoAvailable) {
      console.warn('Skipping: no MongoDB reachable at', TEST_MONGODB_URI);
      return;
    }

    await seedSectors();
    await seedCategories();
    await seedServices();

    const devCategory = await Category.findOne({ slug: 'dev-services' });
    expect(devCategory).not.toBeNull();
    expect(devCategory?.deprecated).toBe(false);

    const csam = await Service.findOne({ shortName: 'CSAM' });
    expect(csam).not.toBeNull();
    expect(csam?.repositoryTable).toBe('INTACT_TOOLBOX');
    expect(csam?.deprecated).toBe(false);
    expect(csam?.categoryId?.toString()).toBe(devCategory?._id.toString());

    const infraService = await Service.findOne({ shortName: 'ORO-5GLAB' });
    expect(infraService).not.toBeNull();
    expect(infraService?.repositoryTable).toBe('OTHER_SERVICES');
    expect(infraService?.deprecated).toBe(false);
    expect(infraService?.sectorId).toBeDefined();

    const sector = await Sector.findOne({ slug: 'digital-infrastructure' });
    expect(infraService?.sectorId?.toString()).toBe(sector?._id.toString());
  });

  test('is idempotent — re-running the seeds does not duplicate or drift', async () => {
    if (!mongoAvailable) return;

    const beforeCategories = await Category.countDocuments();
    const beforeServices = await Service.countDocuments();

    await seedCategories();
    await seedServices();

    const afterCategories = await Category.countDocuments();
    const afterServices = await Service.countDocuments();

    expect(afterCategories).toBe(beforeCategories);
    expect(afterServices).toBe(beforeServices);
  });

  test('updates a drifted field on an already-seeded service without duplicating it', async () => {
    if (!mongoAvailable) return;

    await Service.updateOne({ shortName: 'CSAM' }, { $set: { description: 'stale description' } });

    await seedServices();

    const csam = await Service.findOne({ shortName: 'CSAM' });
    expect(csam?.description).not.toBe('stale description');
    expect(await Service.countDocuments({ shortName: 'CSAM' })).toBe(1);
  });

  test('resolves issue #6 — legacy "Cybersecurity Infrastructure"-era entries are deprecated, not deleted', async () => {
    if (!mongoAvailable) return;

    // Simulate the pre-refresh database: the old INTACT "Infrastructure"
    // category (used for the message-broker tool) and its service, inserted
    // via the raw driver (bypassing Mongoose) so neither `deprecated` nor
    // `seedManaged` exist on the stored document at all — exactly what a
    // database seeded before this PR looks like.
    const legacyCategoryResult = await Category.collection.insertOne({
      name: 'Infrastructure (legacy)',
      slug: 'infrastructure-legacy-test',
      description: 'Legacy INTACT infrastructure category',
    } as never);
    await Service.collection.insertOne({
      shortName: 'AEGIS-COS-LEGACY-TEST',
      title: 'Legacy message broker',
      categoryId: legacyCategoryResult.insertedId,
      provider: 'AEGIS',
      type: 'Software',
      repositoryTable: 'INTACT_TOOLBOX',
      standards: [],
      inputs: [],
      outputs: [],
      interactsWith: [],
      potentialUseCases: [],
    } as never);

    await seedCategories();
    await seedServices();

    const refreshedCategory = await Category.findOne({ slug: 'infrastructure-legacy-test' });
    const refreshedService = await Service.findOne({ shortName: 'AEGIS-COS-LEGACY-TEST' });

    // Not deleted (no dangling references from anything that still points at them)...
    expect(refreshedCategory).not.toBeNull();
    expect(refreshedService).not.toBeNull();
    // ...but no longer part of the active, non-deprecated catalog.
    expect(refreshedCategory?.deprecated).toBe(true);
    expect(refreshedService?.deprecated).toBe(true);
  });

  test('never deprecates a service created manually through the admin API path', async () => {
    if (!mongoAvailable) return;

    // `Service.create()` goes through the schema, so — like the real
    // `POST /api/services` handler — this gets `seedManaged: false` by
    // schema default, without the test setting it explicitly.
    const devCategory = await Category.findOne({ slug: 'dev-services' });
    const customService = await Service.create({
      shortName: 'CUSTOM-ADMIN-TOOL',
      title: 'Hand-added tool',
      categoryId: devCategory?._id,
      provider: 'Internal',
      type: 'Software',
      repositoryTable: 'INTACT_TOOLBOX',
      standards: [],
      inputs: [],
      outputs: [],
      interactsWith: [],
      potentialUseCases: [],
    });
    expect(customService.seedManaged).toBe(false);

    await seedServices();

    const refreshed = await Service.findOne({ shortName: 'CUSTOM-ADMIN-TOOL' });
    expect(refreshed?.deprecated).toBe(false);
  });

  test('un-deprecates a record that reappears in the seed source', async () => {
    if (!mongoAvailable) return;

    await Category.updateOne({ slug: 'dev-services' }, { $set: { deprecated: true } });

    await seedCategories();

    const devCategory = await Category.findOne({ slug: 'dev-services' });
    expect(devCategory?.deprecated).toBe(false);
  });
});
