import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { Service } from '../models/Service.js';
import { Category } from '../models/Category.js';
import { Sector } from '../models/Sector.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateQuery, validateBody, objectIdSchema } from '../middleware/validation.js';
import {
  asyncHandler,
  findById,
  findByIdAndUpdate,
  findByIdAndDelete,
  validateObjectIdParam,
} from '../middleware/entityLoader.js';
import { buildCaseInsensitiveFilter, buildSearchOrFilter } from '../utils/search.js';
import { REPOSITORY_TABLES } from '../lib/constants.js';

const router: RouterType = Router();

/** Fields a free-text `?search=` term is matched against. */
const SEARCH_FIELDS = ['shortName', 'title', 'description'] as const;

// Validation schemas
const inputOutputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  format: z.string().max(100).optional(),
});

const createServiceSchema = z.object({
  shortName: z
    .string()
    .min(1)
    .max(50)
    .transform((val) => val.toUpperCase()),
  title: z.string().min(1).max(200),
  categoryId: z
    .string()
    .refine((val) => objectIdSchema.safeParse(val).success, 'Invalid category ID'),
  sectorId: z
    .string()
    .refine((val) => objectIdSchema.safeParse(val).success, 'Invalid sector ID')
    .optional(),
  provider: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  type: z.enum(['Software', 'Hardware', 'Software/Hardware']).default('Software'),
  uiType: z.enum(['web', 'terminal', 'both']).default('web'),
  trl: z
    .object({
      current: z.number().min(1).max(9).optional(),
      expected: z.number().min(1).max(9).optional(),
    })
    .optional(),
  license: z.string().max(100).optional(),
  standards: z.array(z.string().max(100)).default([]),
  inputs: z.array(inputOutputSchema).default([]),
  outputs: z.array(inputOutputSchema).default([]),
  interactsWith: z.array(z.string().max(100)).default([]),
  potentialUseCases: z.array(z.string().max(500)).default([]),
  repositoryTable: z
    .enum([REPOSITORY_TABLES.INTACT_TOOLBOX, REPOSITORY_TABLES.OTHER_SERVICES])
    .default(REPOSITORY_TABLES.INTACT_TOOLBOX),
  currentVersion: z.string().max(50).optional(),
  versions: z
    .array(
      z.object({
        version: z.string().min(1).max(50),
        dockerImage: z.string().min(1).max(500),
        releaseNotes: z.string().max(2000).optional(),
        releasedAt: z.string().datetime().optional(),
      })
    )
    .default([]),
});

const updateServiceSchema = createServiceSchema.partial();

const addVersionSchema = z.object({
  version: z.string().min(1).max(50),
  dockerImage: z.string().min(1).max(500),
  releaseNotes: z.string().max(2000).optional(),
});

const listServicesSchema = z.object({
  table: z.enum([REPOSITORY_TABLES.INTACT_TOOLBOX, REPOSITORY_TABLES.OTHER_SERVICES]).optional(),
  category: z.string().optional(),
  sector: z.string().optional(),
  provider: z.string().optional(),
  search: z.string().optional(),
  includeDeprecated: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(parseInt(val, 10), 1000) : 20)),
  skip: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0)),
});

type ListServicesQuery = z.infer<typeof listServicesSchema>;

// GET /api/services
// By default, services deprecated by a catalog refresh (see
// `seed/services.seed.ts`) are excluded. Pass `?includeDeprecated=true` to
// see the full history, e.g. for admin/audit views.
router.get(
  '/',
  authMiddleware,
  validateQuery(listServicesSchema),
  asyncHandler(async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsedQuery = req.query as any as ListServicesQuery;
    const { table, category, sector, provider, search, includeDeprecated, limit, skip } =
      parsedQuery;

    const query: Record<string, unknown> = {};

    if (!includeDeprecated) {
      query.deprecated = { $ne: true };
    }

    if (table) {
      query.repositoryTable = table;
    }

    if (category) {
      query.categoryId = category;
    }

    if (sector) {
      query.sectorId = sector;
    }

    if (provider) {
      query.provider = buildCaseInsensitiveFilter(provider);
    }

    if (search) {
      query.$or = buildSearchOrFilter(SEARCH_FIELDS, search);
    }

    const [services, total] = await Promise.all([
      Service.find(query)
        .populate('categoryId', 'name slug')
        .populate('sectorId', 'name slug category')
        .sort({ shortName: 1 })
        .skip(skip as number)
        .limit(limit as number)
        .lean(),
      Service.countDocuments(query),
    ]);

    res.json({
      services,
      total,
      limit,
      skip,
    });
  })
);

// GET /api/services/:id
router.get(
  '/:id',
  authMiddleware,
  validateObjectIdParam,
  asyncHandler(async (req, res) => {
    const service = await findById(Service, req.params.id, [
      'categoryId',
      { path: 'sectorId', select: 'name slug category' },
    ]);

    res.json(service);
  })
);

// POST /api/services - Create new service
router.post(
  '/',
  authMiddleware,
  validateBody(createServiceSchema),
  asyncHandler(async (req, res) => {
    const data = req.body;

    // Check if category exists
    await findById(Category, data.categoryId);

    // Check if sector exists (if provided)
    if (data.sectorId) {
      await findById(Sector, data.sectorId);
    }

    // Check for duplicate shortName
    const existingService = await Service.findOne({ shortName: data.shortName });
    if (existingService) {
      throw new Error('Service with this short name already exists');
    }

    // Set currentVersion from versions if provided
    if (data.versions && data.versions.length > 0 && !data.currentVersion) {
      data.currentVersion = data.versions[data.versions.length - 1].version;
    }

    const service = new Service(data);
    await service.save();

    const populatedService = await Service.findById(service._id)
      .populate('categoryId', 'name slug')
      .populate('sectorId', 'name slug category')
      .lean();

    res.status(201).json(populatedService);
  })
);

// PUT /api/services/:id - Update service
router.put(
  '/:id',
  authMiddleware,
  validateObjectIdParam,
  validateBody(updateServiceSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = req.body;

    // Check if category exists (if being updated)
    if (data.categoryId) {
      await findById(Category, data.categoryId);
    }

    // Check if sector exists (if being updated)
    if (data.sectorId) {
      await findById(Sector, data.sectorId);
    }

    // Check for duplicate shortName (if being updated)
    if (data.shortName) {
      const existingService = await Service.findOne({
        shortName: data.shortName,
        _id: { $ne: id },
      });
      if (existingService) {
        throw new Error('Service with this short name already exists');
      }
    }

    const service = await findByIdAndUpdate(
      Service,
      id,
      { $set: data },
      { new: true, runValidators: true },
      ['categoryId', { path: 'sectorId', select: 'name slug category' }]
    );

    res.json(service);
  })
);

// DELETE /api/services/:id - Delete service
router.delete(
  '/:id',
  authMiddleware,
  validateObjectIdParam,
  asyncHandler(async (req, res) => {
    await findByIdAndDelete(Service, req.params.id);
    res.json({ message: 'Service deleted successfully' });
  })
);

// POST /api/services/:id/versions - Add new version
router.post(
  '/:id/versions',
  authMiddleware,
  validateObjectIdParam,
  validateBody(addVersionSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { version, dockerImage, releaseNotes } = req.body;

    const service = await Service.findById(id);
    if (!service) {
      throw new Error('Service not found');
    }

    // Check for duplicate version
    const existingVersion = service.versions.find((v) => v.version === version);
    if (existingVersion) {
      throw new Error('Version already exists');
    }

    // Add new version
    service.versions.push({
      version,
      dockerImage,
      releaseNotes,
      releasedAt: new Date(),
    });

    // Update currentVersion
    service.currentVersion = version;

    await service.save();

    const populatedService = await Service.findById(id)
      .populate('categoryId', 'name slug')
      .populate('sectorId', 'name slug category')
      .lean();

    res.json(populatedService);
  })
);

export default router;
