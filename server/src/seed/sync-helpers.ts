import type { Model, Document, FilterQuery, UpdateQuery } from 'mongoose';

/**
 * Shared create/update/deprecate mechanism for seed scripts.
 *
 * Historically `seedCategories()` and `seedServices()` were create-only: they
 * inserted a record the first time and silently no-op'd on every subsequent
 * run, even if the seed source data had since changed. That made it
 * impossible to refresh a catalog (rename/re-describe an existing entry) or
 * to retire entries that are no longer part of the source-of-truth list.
 *
 * `upsertRecord` and `deprecateStale` below give every seed script the same
 * three-way behavior instead:
 *   - create records that don't exist yet
 *   - update records whose tracked fields drifted from the seed data (and
 *     clear any previous `deprecated` flag if the record reappeared)
 *   - mark records that are no longer present in the seed data as
 *     `deprecated: true` instead of deleting them, so existing references
 *     (e.g. a `Scenario.serviceId` pointing at a `Service`, or a
 *     `Service.categoryId` pointing at a `Category`) never dangle.
 *
 * `deprecateStale` only ever touches records it considers "seed-managed"
 * (`seedManaged !== false`) — every record `upsertRecord` creates or updates
 * is stamped `seedManaged: true`, and pre-existing legacy records (seeded
 * before this field existed) have no stored value for it, which counts the
 * same as `true` for this purpose. The only records excluded are ones
 * explicitly stamped `seedManaged: false`, e.g. a service an operator later
 * creates by hand through `POST /api/services` — a manually-added record
 * must never be silently deprecated just because a catalog refresh no
 * longer mentions its `shortName`.
 */

export type UpsertAction = 'created' | 'updated' | 'unchanged';

/** Structural-equality check that ignores key order (arrays stay order-sensitive). */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((item, i) => valuesEqual(item, b[i]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as Record<string, unknown>).sort();
    const bKeys = Object.keys(b as Record<string, unknown>).sort();
    if (aKeys.length !== bKeys.length || aKeys.some((k, i) => k !== bKeys[i])) return false;
    return aKeys.every((k) =>
      valuesEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
    );
  }

  return false;
}

/** Reads a field off a hydrated mongoose document (or a plain object in tests). */
function readField(doc: unknown, field: string): unknown {
  if (
    doc &&
    typeof doc === 'object' &&
    'toObject' in doc &&
    typeof (doc as { toObject: unknown }).toObject === 'function'
  ) {
    return (doc as { toObject: () => Record<string, unknown> }).toObject()[field];
  }
  return (doc as Record<string, unknown> | null)?.[field];
}

/**
 * Create-or-update a single record matched by `filter`.
 *
 * `desiredFields` is the full set of fields the record should have going
 * forward. Any field present on the existing document but absent from
 * `desiredFields` is left untouched (this only manages the tracked fields the
 * caller passes in, e.g. it never touches `_id`/`createdAt`).
 */
export async function upsertRecord<TDoc extends Document>(
  model: Model<TDoc>,
  filter: Record<string, unknown>,
  desiredFields: Record<string, unknown>
): Promise<UpsertAction> {
  const existing = await model.findOne(filter as FilterQuery<TDoc>);

  if (!existing) {
    // `filter` carries the match key (e.g. `shortName`/`slug`), which may or
    // may not also be duplicated in `desiredFields` depending on the caller —
    // merge both so the new document always has its key set.
    await model.create({
      ...filter,
      ...desiredFields,
      deprecated: false,
      seedManaged: true,
    } as unknown as TDoc);
    return 'created';
  }

  const wasDeprecated = readField(existing, 'deprecated') === true;
  const wasSeedManaged = readField(existing, 'seedManaged') === true;
  const fieldsChanged = Object.entries(desiredFields).some(
    ([key, value]) => !valuesEqual(readField(existing, key), value)
  );

  if (fieldsChanged || wasDeprecated || !wasSeedManaged) {
    await model.updateOne(
      filter as FilterQuery<TDoc>,
      { $set: { ...desiredFields, deprecated: false, seedManaged: true } } as UpdateQuery<TDoc>
    );
    return 'updated';
  }

  return 'unchanged';
}

/**
 * Mark every non-deprecated, seed-managed record matched by `scopeFilter`
 * whose `keyField` value is not in `activeKeys` as `deprecated: true`.
 * Records explicitly stamped `seedManaged: false` (created outside the seed
 * mechanism) are never touched. Returns the number of records deprecated in
 * this call.
 */
export async function deprecateStale<TDoc extends Document>(
  model: Model<TDoc>,
  scopeFilter: Record<string, unknown>,
  keyField: string,
  activeKeys: readonly string[]
): Promise<number> {
  const result = await model.updateMany(
    {
      ...scopeFilter,
      [keyField]: { $nin: [...activeKeys] },
      deprecated: { $ne: true },
      seedManaged: { $ne: false },
    } as FilterQuery<TDoc>,
    { $set: { deprecated: true } } as UpdateQuery<TDoc>
  );

  return result.modifiedCount ?? 0;
}
