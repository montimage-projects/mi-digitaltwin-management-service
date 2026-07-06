import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import mongoose from 'mongoose';
import { Category } from '../../models/Category.js';
import { Service } from '../../models/Service.js';
import { Sector } from '../../models/Sector.js';
import { Partner } from '../../models/Partner.js';
import { seedSectors } from '../sectors.seed.js';
import { seedCategories } from '../categories.seed.js';
import { seedServices } from '../services.seed.js';
import { seedPartners } from '../partners.seed.js';

/**
 * Integration tests for the catalog refresh (issues #5, #6, #7, #8).
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
    await seedPartners();

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

    const coordinator = await Partner.findOne({ shortName: 'SINTEF' });
    expect(coordinator).not.toBeNull();
    expect(coordinator?.role).toBe('COO');
    expect(coordinator?.legalName).toBe('SINTEF AS');
    expect(coordinator?.deprecated).toBe(false);
    expect(await Partner.countDocuments()).toBe(19);
  });

  test('is idempotent — re-running the seeds does not duplicate or drift', async () => {
    if (!mongoAvailable) return;

    const beforeCategories = await Category.countDocuments();
    const beforeServices = await Service.countDocuments();
    const beforePartners = await Partner.countDocuments();

    await seedCategories();
    await seedServices();
    await seedPartners();

    const afterCategories = await Category.countDocuments();
    const afterServices = await Service.countDocuments();
    const afterPartners = await Partner.countDocuments();

    expect(afterCategories).toBe(beforeCategories);
    expect(afterServices).toBe(beforeServices);
    expect(afterPartners).toBe(beforePartners);
  });

  test('updates a drifted field on an already-seeded service without duplicating it', async () => {
    if (!mongoAvailable) return;

    await Service.updateOne({ shortName: 'CSAM' }, { $set: { description: 'stale description' } });

    await seedServices();

    const csam = await Service.findOne({ shortName: 'CSAM' });
    expect(csam?.description).not.toBe('stale description');
    expect(await Service.countDocuments({ shortName: 'CSAM' })).toBe(1);
  });

  test('resolves issue #12 — backfills seedManaged and updates a legacy record missing the flag entirely', async () => {
    if (!mongoAvailable) return;

    // Simulate a legacy category seeded before `seedManaged` existed: delete
    // the properly-seeded 'dev-services' category and replace it, via the
    // raw driver (bypassing Mongoose — and therefore its schema defaults),
    // with a document that has a drifted `description` and NO `seedManaged`
    // key stored at all. Before the fix, `model.findOne(filter)` returned a
    // hydrated Document whose `seedManaged` path was defaulted to `false` by
    // the schema, which was indistinguishable from an explicit
    // `seedManaged: false` — so `upsertRecord` wrongly left this record
    // `unchanged` (stale description, never backfilled) instead of updating
    // it. `.lean()` reads the truly-stored value (`undefined`), so this must
    // now be corrected on the next catalog refresh.
    await Category.deleteOne({ slug: 'dev-services' });
    await Category.collection.insertOne({
      name: 'Dev Services',
      slug: 'dev-services',
      description: 'stale legacy description, predates seedManaged',
      deprecated: false,
    } as never);

    const legacyBefore = await Category.collection.findOne({ slug: 'dev-services' });
    expect(legacyBefore && 'seedManaged' in legacyBefore).toBe(false);

    await seedCategories();

    const refreshed = await Category.findOne({ slug: 'dev-services' });
    expect(refreshed).not.toBeNull();
    expect(refreshed?.description).not.toBe('stale legacy description, predates seedManaged');
    expect(refreshed?.seedManaged).toBe(true);
    expect(refreshed?.deprecated).toBe(false);
    expect(await Category.countDocuments({ slug: 'dev-services' })).toBe(1);
  });

  test('resolves issue #12 — never overwrites an operator record with explicit seedManaged=false, even on a real Mongoose document', async () => {
    if (!mongoAvailable) return;

    // Companion regression proof for the fix above: an explicit
    // `seedManaged: false` must still be respected against a real hydrated
    // Mongoose Document (not just the in-memory FakeModel in
    // sync-helpers.test.ts). Delete the properly-seeded 'ops-services'
    // category and replace it, via the raw driver, with a record whose key
    // collides with an active seed entry but is explicitly operator-owned
    // and has drifted fields.
    await Category.deleteOne({ slug: 'ops-services' });
    await Category.collection.insertOne({
      name: 'Operator Ops Category',
      slug: 'ops-services',
      description: 'Operator-owned description, not from seed data',
      deprecated: false,
      seedManaged: false,
    } as never);

    await seedCategories();

    const refreshed = await Category.findOne({ slug: 'ops-services' });
    expect(refreshed).not.toBeNull();
    expect(refreshed?.name).toBe('Operator Ops Category');
    expect(refreshed?.description).toBe('Operator-owned description, not from seed data');
    expect(refreshed?.deprecated).toBe(false);
    expect(refreshed?.seedManaged).toBe(false);
    expect(await Category.countDocuments({ slug: 'ops-services' })).toBe(1);
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

  test('resolves issue #8 — updates a drifted field on an already-seeded partner without duplicating it', async () => {
    if (!mongoAvailable) return;

    await Partner.updateOne({ shortName: 'MI' }, { $set: { legalName: 'STALE LEGAL NAME' } });

    await seedPartners();

    const mi = await Partner.findOne({ shortName: 'MI' });
    expect(mi?.legalName).toBe('MONTIMAGE EURL');
    expect(await Partner.countDocuments({ shortName: 'MI' })).toBe(1);
  });

  test('resolves issue #8 — deprecates a seed-managed partner no longer in the source list, without deleting it', async () => {
    if (!mongoAvailable) return;

    // Simulate a partner from a prior grant agreement version that has since
    // left the consortium: seed-managed, but its `shortName` will never
    // appear in `partners.seed.ts`'s source data.
    await Partner.create({
      shortName: 'FORMER-PARTNER-TEST',
      legalName: 'Former Partner Ltd',
      role: 'BEN',
      country: 'Nowhere',
      pic: '000000001',
      maxGrantAmountEur: 1,
      seedManaged: true,
    });

    await seedPartners();

    const former = await Partner.findOne({ shortName: 'FORMER-PARTNER-TEST' });
    expect(former).not.toBeNull();
    expect(former?.deprecated).toBe(true);
  });

  test('never deprecates a partner created manually outside the seed mechanism', async () => {
    if (!mongoAvailable) return;

    // Explicit `seedManaged: false` simulates a partner an operator added by
    // hand rather than through `seedPartners()`.
    const manualPartner = await Partner.create({
      shortName: 'MANUAL-PARTNER-TEST',
      legalName: 'Manually Added Partner',
      role: 'BEN',
      country: 'Nowhere',
      pic: '000000002',
      maxGrantAmountEur: 1,
      seedManaged: false,
    });
    expect(manualPartner.seedManaged).toBe(false);

    await seedPartners();

    const refreshed = await Partner.findOne({ shortName: 'MANUAL-PARTNER-TEST' });
    expect(refreshed?.deprecated).toBe(false);
  });
});
