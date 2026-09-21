import { describe, test, expect, afterEach } from 'vitest';
import { Partner } from '../../models/Partner.js';
import { seedPartners, partnersData } from '../partners.seed.js';

/**
 * Unit tests for `seedPartners()` (issue #8), covering the create / update /
 * unchanged / deprecate paths described in `sync-helpers.ts` without
 * requiring a real MongoDB connection.
 *
 * `seedPartners()` (like `seedCategories()`) calls its model directly rather
 * than taking it as a parameter, so — mirroring the in-memory harness style
 * used in `sync-helpers.test.ts` — these tests swap the real `Partner`
 * model's `findOne`/`create`/`updateOne`/`updateMany` statics for an
 * in-memory fake for the duration of each test, then restore the originals
 * in `afterEach` so no state leaks into other test files.
 */

interface FakePartnerDoc extends Record<string, unknown> {
  _id: string;
}

/** Minimal stand-in for a mongoose `Model<T>`, backed by an in-memory array. */
class FakeModel<TDoc extends FakePartnerDoc> {
  public docs: TDoc[] = [];
  private nextId = 1;

  findOne = (
    filter: Record<string, unknown>
  ): { lean: () => Promise<TDoc | null> } & Promise<TDoc | null> => {
    const result = this.docs.find((doc) => matches(doc, filter)) ?? null;
    const promise = Promise.resolve(result) as Promise<TDoc | null> & {
      lean: () => Promise<TDoc | null>;
    };
    // `upsertRecord` now chains `.lean()` off `findOne()` (see sync-helpers.ts)
    // to get the truly-stored value instead of a hydrated document with
    // schema defaults applied. FakeModel already stores/returns plain
    // objects with no defaulting, so `.lean()` here is a pure passthrough —
    // it exists only so the stub stays chainable, not to change behavior.
    promise.lean = () => Promise.resolve(result);
    return promise;
  };

  create = async (data: Record<string, unknown>): Promise<TDoc> => {
    const doc = { _id: `id-${this.nextId++}`, ...data } as TDoc;
    this.docs.push(doc);
    return doc;
  };

  updateOne = async (
    filter: Record<string, unknown>,
    update: { $set: Record<string, unknown> }
  ): Promise<{ modifiedCount: number }> => {
    const doc = this.docs.find((d) => matches(d, filter));
    if (!doc) return { modifiedCount: 0 };
    Object.assign(doc, update.$set);
    return { modifiedCount: 1 };
  };

  updateMany = async (
    filter: Record<string, unknown>,
    update: { $set: Record<string, unknown> }
  ): Promise<{ modifiedCount: number }> => {
    let modifiedCount = 0;
    for (const doc of this.docs) {
      if (matches(doc, filter)) {
        Object.assign(doc, update.$set);
        modifiedCount++;
      }
    }
    return { modifiedCount };
  };
}

/** Tiny query matcher supporting the operators sync-helpers actually emits. */
function matches(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    const value = doc[key];
    if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
      const ops = condition as Record<string, unknown>;
      if ('$nin' in ops) return !(ops.$nin as unknown[]).includes(value);
      if ('$ne' in ops) return value !== ops.$ne;
      return false;
    }
    return value === condition;
  });
}

type PartnerModelRecord = Record<string, unknown>;

const partnerAsRecord = Partner as unknown as PartnerModelRecord;
const originalStatics: PartnerModelRecord = {
  findOne: partnerAsRecord.findOne,
  create: partnerAsRecord.create,
  updateOne: partnerAsRecord.updateOne,
  updateMany: partnerAsRecord.updateMany,
};

/** Installs an in-memory fake in place of the real Partner model statics. */
function installFake(): FakeModel<FakePartnerDoc> {
  const fake = new FakeModel<FakePartnerDoc>();
  const target = Partner as unknown as PartnerModelRecord;
  target.findOne = fake.findOne;
  target.create = fake.create;
  target.updateOne = fake.updateOne;
  target.updateMany = fake.updateMany;
  return fake;
}

afterEach(() => {
  Object.assign(Partner as unknown as PartnerModelRecord, originalStatics);
});

describe('seedPartners', () => {
  test('creates all 19 partners from the source table on a clean run', async () => {
    const fake = installFake();

    await seedPartners();

    expect(fake.docs).toHaveLength(19);
    expect(fake.docs).toHaveLength(partnersData.length);

    const sintef = fake.docs.find((d) => d.shortName === 'SINTEF');
    expect(sintef).toMatchObject({
      shortName: 'SINTEF',
      legalName: 'SINTEF AS',
      role: 'COO',
      country: 'Norway',
      pic: '910945140',
      maxGrantAmountEur: 1076625.0,
      deprecated: false,
      seedManaged: true,
    });
  });

  test('is idempotent — re-running reports unchanged and does not duplicate', async () => {
    const fake = installFake();

    await seedPartners();
    const countAfterFirstRun = fake.docs.length;

    await seedPartners();

    expect(fake.docs).toHaveLength(countAfterFirstRun);
  });

  test('updates a partner whose tracked field drifted from the source', async () => {
    const fake = installFake();
    await seedPartners();

    const mi = fake.docs.find((d) => d.shortName === 'MI');
    expect(mi).toBeDefined();
    if (mi) mi.legalName = 'STALE LEGAL NAME';

    await seedPartners();

    const refreshed = fake.docs.find((d) => d.shortName === 'MI');
    expect(refreshed?.legalName).toBe('MONTIMAGE EURL');
    expect(fake.docs.filter((d) => d.shortName === 'MI')).toHaveLength(1);
  });

  test('deprecates a seed-managed partner no longer present in the source', async () => {
    const fake = installFake();
    await fake.create({
      shortName: 'GHOST-PARTNER',
      legalName: 'Ghost Partner Ltd',
      role: 'BEN',
      country: 'Nowhere',
      pic: '000000000',
      maxGrantAmountEur: 1,
      deprecated: false,
      seedManaged: true,
    });

    await seedPartners();

    const ghost = fake.docs.find((d) => d.shortName === 'GHOST-PARTNER');
    expect(ghost?.deprecated).toBe(true);
  });

  test('never deprecates or overwrites a partner explicitly marked seedManaged=false', async () => {
    const fake = installFake();
    await fake.create({
      shortName: 'MI',
      legalName: 'Hand-edited legal name',
      role: 'BEN',
      country: 'France',
      pic: '999716242',
      maxGrantAmountEur: 1,
      deprecated: false,
      seedManaged: false,
    });

    await seedPartners();

    const mi = fake.docs.find((d) => d.shortName === 'MI');
    expect(mi?.legalName).toBe('Hand-edited legal name');
    expect(mi?.deprecated).toBe(false);
    expect(fake.docs.filter((d) => d.shortName === 'MI')).toHaveLength(1);
  });

  test('re-activates (un-deprecates) a partner that reappears in the source', async () => {
    const fake = installFake();
    await seedPartners();

    const mi = fake.docs.find((d) => d.shortName === 'MI');
    if (mi) mi.deprecated = true;

    await seedPartners();

    const refreshed = fake.docs.find((d) => d.shortName === 'MI');
    expect(refreshed?.deprecated).toBe(false);
  });
});
