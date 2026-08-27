import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { Infrastructure } from '../models/Infrastructure.js';
import { Scenario } from '../models/Scenario.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateBody, objectIdSchema } from '../middleware/validation.js';
import { AppError } from '../middleware/errorHandler.js';
import { encrypt } from '../utils/encryption.js';
import { buildClientFromInfrastructure, pingCluster } from '../services/kubernetesDeploy.js';

const router: RouterType = Router();

/**
 * Fields projected out of every infrastructure API response.
 *
 * These handlers read with `.lean()`, which returns the raw MongoDB document
 * and therefore bypasses the schema's `toJSON` transform — the transform that
 * strips `credentials` and `__v`. Without this explicit projection the
 * encrypted credential blob (`iv` / `encrypted` / `authTag`) leaks to every API
 * consumer (issue #38, F-BUG-002).
 */
const PUBLIC_PROJECTION = '-credentials -__v';

// Validation schemas
const capacitySchema = z.object({
  cpu: z.number().positive().optional(),
  memory: z.number().positive().optional(),
  storage: z.number().positive().optional(),
});

const createInfrastructureSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['kubernetes', 'docker', 'virtual']),
  endpoint: z.string().min(1).max(500).url(),
  credentials: z.string().min(1), // Plaintext credentials to be encrypted
  capacity: capacitySchema.optional(),
  skipTLSVerify: z.boolean().optional(),
});

const updateInfrastructureSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['kubernetes', 'docker', 'virtual']).optional(),
  endpoint: z.string().min(1).max(500).url().optional(),
  credentials: z.string().min(1).optional(), // Optional - only update if provided
  capacity: capacitySchema.optional(),
  skipTLSVerify: z.boolean().optional(),
});

// GET /api/infrastructures - List all infrastructures
router.get('/', authMiddleware, async (_req, res, next) => {
  try {
    const infrastructures = await Infrastructure.find()
      .sort({ name: 1 })
      .select(PUBLIC_PROJECTION)
      .lean();

    res.json(infrastructures);
  } catch (error) {
    next(error);
  }
});

// POST /api/infrastructures - Create new infrastructure
router.post(
  '/',
  authMiddleware,
  validateBody(createInfrastructureSchema),
  async (req, res, next) => {
    try {
      const { name, type, endpoint, credentials, capacity, skipTLSVerify } = req.body;

      // Check for duplicate name
      const existing = await Infrastructure.findOne({ name });
      if (existing) {
        throw new AppError('Infrastructure with this name already exists', 409);
      }

      // Encrypt credentials
      const encryptedCredentials = encrypt(credentials);

      const infrastructure = new Infrastructure({
        name,
        type,
        endpoint,
        credentials: encryptedCredentials,
        capacity: capacity || {},
        status: 'inactive',
        skipTLSVerify,
      });

      await infrastructure.save();

      // Re-read the stored document, projecting the credentials out: `.lean()`
      // skips the `toJSON` transform, so the exclusion must be explicit.
      const result = await Infrastructure.findById(infrastructure._id)
        .select(PUBLIC_PROJECTION)
        .lean();
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/infrastructures/:id - Get infrastructure detail
router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;

    const parseResult = objectIdSchema.safeParse(id);
    if (!parseResult.success) {
      throw new AppError('Invalid infrastructure ID', 400);
    }

    const infrastructure = await Infrastructure.findById(id).select(PUBLIC_PROJECTION).lean();

    if (!infrastructure) {
      throw new AppError('Infrastructure not found', 404);
    }

    res.json(infrastructure);
  } catch (error) {
    next(error);
  }
});

// PUT /api/infrastructures/:id - Update infrastructure
router.put(
  '/:id',
  authMiddleware,
  validateBody(updateInfrastructureSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, type, endpoint, credentials, capacity, skipTLSVerify } = req.body;

      const parseResult = objectIdSchema.safeParse(id);
      if (!parseResult.success) {
        throw new AppError('Invalid infrastructure ID', 400);
      }

      // Check for duplicate name
      if (name) {
        const existing = await Infrastructure.findOne({ name, _id: { $ne: id } });
        if (existing) {
          throw new AppError('Infrastructure with this name already exists', 409);
        }
      }

      const updateData: Record<string, unknown> = {};
      if (name) updateData.name = name;
      if (type) updateData.type = type;
      if (endpoint) updateData.endpoint = endpoint;
      if (capacity) updateData.capacity = capacity;
      if (skipTLSVerify !== undefined) updateData.skipTLSVerify = skipTLSVerify;

      // Encrypt new credentials if provided
      if (credentials) {
        updateData.credentials = encrypt(credentials);
      }

      const infrastructure = await Infrastructure.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true, runValidators: true }
      )
        .select(PUBLIC_PROJECTION)
        .lean();

      if (!infrastructure) {
        throw new AppError('Infrastructure not found', 404);
      }

      res.json(infrastructure);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/infrastructures/:id - Delete infrastructure
router.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;

    const parseResult = objectIdSchema.safeParse(id);
    if (!parseResult.success) {
      throw new AppError('Invalid infrastructure ID', 400);
    }

    // Check if infrastructure is in use
    const scenariosUsingInfra = await Scenario.findOne({ infrastructureId: id });
    if (scenariosUsingInfra) {
      throw new AppError('Cannot delete infrastructure: it is used by one or more scenarios', 400);
    }

    const infrastructure = await Infrastructure.findByIdAndDelete(id);

    if (!infrastructure) {
      throw new AppError('Infrastructure not found', 404);
    }

    res.json({ message: 'Infrastructure deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// POST /api/infrastructures/:id/test - Test connection
router.post('/:id/test', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;

    const parseResult = objectIdSchema.safeParse(id);
    if (!parseResult.success) {
      throw new AppError('Invalid infrastructure ID', 400);
    }

    const infrastructure = await Infrastructure.findById(id);

    if (!infrastructure) {
      throw new AppError('Infrastructure not found', 404);
    }

    // Decrypt credentials, build a cluster client and make a lightweight real
    // call (list a single namespace). Expected connection failures — an
    // unreachable endpoint, bad credentials or a TLS error — must not 500 the
    // route: they resolve to `success: false` with a descriptive message.
    let success = false;
    let message = 'Connection successful';
    try {
      const clients = buildClientFromInfrastructure(infrastructure);
      await pingCluster(clients);
      success = true;
    } catch (err) {
      message = err instanceof Error ? err.message : 'Connection failed';
    }

    infrastructure.status = success ? 'active' : 'error';
    infrastructure.lastHealthCheck = new Date();

    await infrastructure.save();

    res.json({
      success,
      status: infrastructure.status,
      lastHealthCheck: infrastructure.lastHealthCheck,
      message,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
