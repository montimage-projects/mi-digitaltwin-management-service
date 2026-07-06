import { describe, test, expect } from 'bun:test';
import type { Model, Document } from 'mongoose';
import { upsertRecord, deprecateStale } from '../sync-helpers.js';

/**
 * Unit tests for the generic create/update/deprecate seed mechanism.
 *
 * These run against an in-memory fake "model" (no MongoDB required) so they
 * exercise exactly the decision logic (`created` vs `updated` vs
 * `unchanged`, which records get deprecated, and which are protected via
 * `seedManaged`) without depending on a database connection.
 */

interface FakeDoc extends Record<string, unknown> {
  _id: string;
}

/** Minimal stand-in for a mongoose `Model<T>`, backed by an in-memory array. */
class FakeModel<TDoc extends FakeDoc> {
  public docs: TDoc[] = [];
  private nextId = 1;

  async findOne(filter: Record<string, unknown>): Promise<TDoc | null> {
    return this.docs.find((doc) => matches(doc, filter)) ?? null;
  }

  async create(data: Record<string, unknown>): Promise<TDoc> {
    const doc = { _id: `id-${this.nextId++}`, ...data } as TDoc;
    this.docs.push(doc);
    return doc;
  }

  async updateOne(
    filter: Record<string, unknown>,
    update: { $set: Record<string, unknown> }
  ): Promise<{ modifiedCount: number }> {
    const doc = this.docs.find((d) => matches(d, filter));
    if (!doc) return { modifiedCount: 0 };
    Object.assign(doc, update.$set);
    return { modifiedCount: 1 };
  }

  async updateMany(
    filter: Record<string, unknown>,
    update: { $set: Record<string, unknown> }
  ): Promise<{ modifiedCount: number }> {
    let modifiedCount = 0;
    for (const doc of this.docs) {
      if (matches(doc, filter)) {
        Object.assign(doc, update.$set);
        modifiedCount++;
      }
    }
    return { modifiedCount };
  }
}

/**
 * Tiny query matcher supporting the operators sync-helpers actually emits.
 * Crucially, `$ne` matches documents where the field is entirely absent
 * (not just present-but-different) — same as real MongoDB — since that's
 * what lets `deprecateStale` treat pre-existing legacy records (seeded
 * before `seedManaged` existed) as eligible for deprecation.
 */
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

interface Widget extends FakeDoc {
  slug: string;
  name: string;
  tags: string[];
  deprecated: boolean;
  seedManaged?: boolean;
  trl?: { current: number; expected: number };
}

// `upsertRecord`/`deprecateStale` only rely on findOne/create/updateOne/updateMany,
// so a FakeModel cast to Mongoose's Model<T> type satisfies them at the call site.
function asModel(fake: FakeModel<Widget>): Model<Widget & Document> {
  return fake as unknown as Model<Widget & Document>;
}

describe('upsertRecord', () => {
  test('creates a new record with deprecated=false and seedManaged=true when none exists', async () => {
    const fake = new FakeModel<Widget>();
    const model = asModel(fake);

    const action = await upsertRecord(model, { slug: 'a' }, { slug: 'a', name: 'Widget A' });

    expect(action).toBe('created');
    expect(fake.docs).toHaveLength(1);
    expect(fake.docs[0]).toMatchObject({
      slug: 'a',
      name: 'Widget A',
      deprecated: false,
      seedManaged: true,
    });
  });

  test('reports unchanged when the record already matches the desired fields', async () => {
    const fake = new FakeModel<Widget>();
    await fake.create({
      slug: 'a',
      name: 'Widget A',
      tags: ['x'],
      deprecated: false,
      seedManaged: true,
    });

    const model = asModel(fake);
    const action = await upsertRecord(
      model,
      { slug: 'a' },
      { slug: 'a', name: 'Widget A', tags: ['x'] }
    );

    expect(action).toBe('unchanged');
  });

  test('updates the record when a tracked field drifted from the seed data', async () => {
    const fake = new FakeModel<Widget>();
    await fake.create({
      slug: 'a',
      name: 'Widget A (old)',
      tags: ['x'],
      deprecated: false,
      seedManaged: true,
    });

    const model = asModel(fake);
    const action = await upsertRecord(
      model,
      { slug: 'a' },
      { slug: 'a', name: 'Widget A (new)', tags: ['x'] }
    );

    expect(action).toBe('updated');
    expect(fake.docs[0].name).toBe('Widget A (new)');
  });

  test('detects drift inside nested objects and arrays, not just top-level primitives', async () => {
    const fake = new FakeModel<Widget>();
    await fake.create({
      slug: 'a',
      name: 'Widget A',
      tags: ['x', 'y'],
      trl: { current: 4, expected: 7 },
      deprecated: false,
      seedManaged: true,
    });

    const model = asModel(fake);

    // Array order changed -> should count as a change.
    const reordered = await upsertRecord(
      model,
      { slug: 'a' },
      { slug: 'a', name: 'Widget A', tags: ['y', 'x'], trl: { current: 4, expected: 7 } }
    );
    expect(reordered).toBe('updated');

    // Nested object value changed -> should count as a change.
    const nestedChange = await upsertRecord(
      model,
      { slug: 'a' },
      { slug: 'a', name: 'Widget A', tags: ['y', 'x'], trl: { current: 5, expected: 7 } }
    );
    expect(nestedChange).toBe('updated');

    // Same nested object with keys in a different order -> not a change.
    const sameNested = await upsertRecord(
      model,
      { slug: 'a' },
      { slug: 'a', name: 'Widget A', tags: ['y', 'x'], trl: { expected: 7, current: 5 } }
    );
    expect(sameNested).toBe('unchanged');
  });

  test('re-activates (un-deprecates) a record that reappears in the seed data', async () => {
    const fake = new FakeModel<Widget>();
    await fake.create({
      slug: 'a',
      name: 'Widget A',
      tags: ['x'],
      deprecated: true,
      seedManaged: true,
    });

    const model = asModel(fake);
    const action = await upsertRecord(
      model,
      { slug: 'a' },
      { slug: 'a', name: 'Widget A', tags: ['x'] }
    );

    // Fields are identical, but the record was deprecated, so it must be
    // written back with deprecated: false rather than reported "unchanged".
    expect(action).toBe('updated');
    expect(fake.docs[0].deprecated).toBe(false);
  });

  test('backfills seedManaged=true on a matching legacy record missing the flag', async () => {
    const fake = new FakeModel<Widget>();
    // Simulates a document seeded before `seedManaged` existed: fields match
    // the desired data exactly, but the flag was never stamped.
    await fake.create({ slug: 'a', name: 'Widget A', tags: ['x'], deprecated: false });

    const model = asModel(fake);
    const action = await upsertRecord(
      model,
      { slug: 'a' },
      { slug: 'a', name: 'Widget A', tags: ['x'] }
    );

    expect(action).toBe('updated');
    expect(fake.docs[0].seedManaged).toBe(true);
  });

  test('never overwrites or reclassifies a record explicitly marked seedManaged=false, even when its key collides with a seed entry', async () => {
    const fake = new FakeModel<Widget>();
    // Simulates a service an operator created by hand via the API — its key
    // (slug) happens to collide with a seed-source entry, and its fields
    // differ from what the seed data would set.
    await fake.create({
      slug: 'a',
      name: 'Operator Widget',
      tags: ['operator-tag'],
      deprecated: false,
      seedManaged: false,
    });

    const model = asModel(fake);
    const action = await upsertRecord(
      model,
      { slug: 'a' },
      { slug: 'a', name: 'Seed Widget', tags: ['seed-tag'] }
    );

    expect(action).toBe('unchanged');
    expect(fake.docs[0]).toMatchObject({
      slug: 'a',
      name: 'Operator Widget',
      tags: ['operator-tag'],
      deprecated: false,
      seedManaged: false,
    });
  });
});

describe('deprecateStale', () => {
  test('deprecates records whose key is no longer in the active set', async () => {
    const fake = new FakeModel<Widget>();
    await fake.create({
      slug: 'keep',
      name: 'Kept',
      tags: [],
      deprecated: false,
      seedManaged: true,
    });
    await fake.create({
      slug: 'retire',
      name: 'Retired',
      tags: [],
      deprecated: false,
      seedManaged: true,
    });

    const model = asModel(fake);
    const count = await deprecateStale(model, {}, 'slug', ['keep']);

    expect(count).toBe(1);
    expect(fake.docs.find((d) => d.slug === 'keep')?.deprecated).toBe(false);
    expect(fake.docs.find((d) => d.slug === 'retire')?.deprecated).toBe(true);
  });

  test('deprecates legacy records with no seedManaged flag at all', async () => {
    const fake = new FakeModel<Widget>();
    // No `seedManaged` field — simulates data seeded before the flag existed.
    await fake.create({ slug: 'retire', name: 'Retired', tags: [], deprecated: false });

    const model = asModel(fake);
    const count = await deprecateStale(model, {}, 'slug', []);

    expect(count).toBe(1);
    expect(fake.docs[0].deprecated).toBe(true);
  });

  test('never deprecates a record explicitly marked seedManaged=false', async () => {
    const fake = new FakeModel<Widget>();
    // Simulates a service an operator created by hand via the API.
    await fake.create({
      slug: 'custom',
      name: 'Custom Widget',
      tags: [],
      deprecated: false,
      seedManaged: false,
    });

    const model = asModel(fake);
    const count = await deprecateStale(model, {}, 'slug', []);

    expect(count).toBe(0);
    expect(fake.docs[0].deprecated).toBe(false);
  });

  test('is idempotent — running it twice only deprecates once', async () => {
    const fake = new FakeModel<Widget>();
    await fake.create({
      slug: 'retire',
      name: 'Retired',
      tags: [],
      deprecated: false,
      seedManaged: true,
    });

    const model = asModel(fake);
    const first = await deprecateStale(model, {}, 'slug', []);
    const second = await deprecateStale(model, {}, 'slug', []);

    expect(first).toBe(1);
    expect(second).toBe(0);
  });

  test('never touches records matching an active key', async () => {
    const fake = new FakeModel<Widget>();
    await fake.create({ slug: 'a', name: 'A', tags: [], deprecated: false, seedManaged: true });
    await fake.create({ slug: 'b', name: 'B', tags: [], deprecated: false, seedManaged: true });

    const model = asModel(fake);
    const count = await deprecateStale(model, {}, 'slug', ['a', 'b']);

    expect(count).toBe(0);
    expect(fake.docs.every((d) => d.deprecated === false)).toBe(true);
  });
});
