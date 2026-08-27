import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError } from './errorHandler.js';

/**
 * Validate an :id parameter against the 24-hex ObjectId format.
 * Returns 400 with a typed error when invalid.
 */
export function validateObjectIdParam(req: Request, _res: Response, next: NextFunction): void {
  const { id } = req.params;

  if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
    next(new AppError('Invalid ID format', 400));
    return;
  }

  next();
}

/**
 * Wrap an async Express handler so that thrown errors are
 * forwarded to `next()` automatically — eliminating the
 * 36× try/catch boilerplate across route files.
 */
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ---------------------------------------------------------------------------
// Entity loader helpers — replace the 28× findById-404 pattern
// ---------------------------------------------------------------------------

interface FindByIdOptions {
  /** Custom 404 error message (default: 'Not found') */
  notFoundMessage?: string;
}

type PopulateSpec = string | { path: string; select?: string };

/**
 * Find a document by _id and throw a 404 when missing.
 * Returns a lean plain object.
 *
 * Usage:
 *   const entity = await findById(Project, req.params.id, 'atomicProjectIds');
 *   // entity is never null
 */
export async function findById<T extends Record<string, unknown> = Record<string, unknown>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  id: string,
  populate?: PopulateSpec | PopulateSpec[],
  options?: FindByIdOptions
): Promise<T> {
  const query = model.findById(id);
  if (populate != null) {
    query.populate(populate);
  }
  const doc = await query.lean();
  if (!doc) {
    throw new AppError(options?.notFoundMessage ?? 'Not found', 404);
  }
  return doc as T;
}

/**
 * Find a document by _id and throw a 404 when missing.
 * Returns a Mongoose document (not lean) so methods like .save() work.
 *
 * Usage:
 *   const user = await findByIdDoc(User, id);
 *   user.username = 'new';
 *   await user.save();
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function findByIdDoc<T = any>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  id: string,
  populate?: PopulateSpec | PopulateSpec[],
  options?: FindByIdOptions
): Promise<T> {
  const query = model.findById(id);
  if (populate != null) {
    query.populate(populate);
  }
  const doc = await query;
  if (!doc) {
    throw new AppError(options?.notFoundMessage ?? 'Not found', 404);
  }
  return doc;
}

interface FindByIdAndUpdateOptions {
  new?: boolean;
  runValidators?: boolean;
  /** Custom 404 error message (default: 'Not found') */
  notFoundMessage?: string;
}

/**
 * Find by _id and update atomically.
 * Returns the updated lean document or throws 404.
 */
export async function findByIdAndUpdate<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  id: string,
  update: Record<string, unknown>,
  options?: FindByIdAndUpdateOptions,
  populate?: PopulateSpec | PopulateSpec[]
): Promise<T> {
  const query = model.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
    ...options,
  });
  if (populate != null) {
    query.populate(populate);
  }
  const doc = await query.lean();
  if (!doc) {
    throw new AppError(options?.notFoundMessage ?? 'Not found', 404);
  }
  return doc as T;
}

/**
 * Find by _id and delete atomically.
 * Returns the deleted lean document or throws 404.
 */
export async function findByIdAndDelete<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  id: string,
  options?: FindByIdOptions
): Promise<T> {
  const doc = await model.findByIdAndDelete(id);
  if (!doc) {
    throw new AppError(options?.notFoundMessage ?? 'Not found', 404);
  }
  return doc as T;
}
