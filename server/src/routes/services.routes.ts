import { Router } from 'express';
import { z } from 'zod';
import { Service } from '../models/Service.js';
import { Category } from '../models/Category.js';
import { Sector } from '../models/Sector.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateQuery, validateBody, objectIdSchema } from '../middleware/validation.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// Validation schemas
const inputOutputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  format: z.string().max(100).optional(),
});

const createServiceSchema = z.object({
  shortName: z.string().min(1).max(50).transform(val => val.toUpperCase()),
  title: z.string().min(1).max(200),
  categoryId: z.string().refine(val => objectIdSchema.safeParse(val).success, 'Invalid category ID'),
  sectorId: z.string().refine(val => objectIdSchema.safeParse(val).success, 'Invalid sector ID').optional(),
  provider: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  type: z.enum(['Software', 'Hardware', 'Software/Hardware']).default('Software'),
  uiType: z.enum(['web', 'terminal', 'both']).default('web'),
  trl: z.object({
    current: z.number().min(1).max(9).optional(),
    expected: z.number().min(1).max(9).optional(),
  }).optional(),
  license: z.string().max(100).optional(),
  standards: z.array(z.string().max(100)).default([]),
  inputs: z.array(inputOutputSchema).default([]),
  outputs: z.array(inputOutputSchema).default([]),
  interactsWith: z.array(z.string().max(100)).default([]),
  potentialUseCases: z.array(z.string().max(500)).default([]),
  repositoryTable: z.enum(['INTACT_TOOLBOX', 'OTHER_SERVICES']).default('INTACT_TOOLBOX'),
  currentVersion: z.string().max(50).optional(),
  versions: z.array(z.object({
    version: z.string().min(1).max(50),
    dockerImage: z.string().min(1).max(500),
    releaseNotes: z.string().max(2000).optional(),
    releasedAt: z.string().datetime().optional(),
  })).default([]),
});

const updateServiceSchema = createServiceSchema.partial();

const addVersionSchema = z.object({
  version: z.string().min(1).max(50),
  dockerImage: z.string().min(1).max(500),
  releaseNotes: z.string().max(2000).optional(),
});

const listServicesSchema = z.object({
  table: z.enum(['INTACT_TOOLBOX', 'OTHER_SERVICES']).optional(),
  category: z.string().optional(),
  sector: z.string().optional(),
  provider: z.string().optional(),
  search: z.string().optional(),
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
router.get('/', authMiddleware, validateQuery(listServicesSchema), async (req, res, next) => {
  try {
    const { table, category, sector, provider, search, limit, skip } = req.query as unknown as ListServicesQuery;

    const query: Record<string, unknown> = {};

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
      query.provider = { $regex: new RegExp(provider, 'i') };
    }

    if (search) {
      query.$or = [
        { shortName: { $regex: new RegExp(search, 'i') } },
        { title: { $regex: new RegExp(search, 'i') } },
        { description: { $regex: new RegExp(search, 'i') } },
      ];
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
  } catch (error) {
    next(error);
  }
});

// GET /api/services/:id
router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate ObjectId format
    const parseResult = objectIdSchema.safeParse(id);
    if (!parseResult.success) {
      throw new AppError('Invalid service ID', 400);
    }

    const service = await Service.findById(id)
      .populate('categoryId', 'name slug')
      .populate('sectorId', 'name slug category')
      .lean();

    if (!service) {
      throw new AppError('Service not found', 404);
    }

    res.json(service);
  } catch (error) {
    next(error);
  }
});

// POST /api/services - Create new service
router.post('/', authMiddleware, validateBody(createServiceSchema), async (req, res, next) => {
  try {
    const data = req.body;

    // Check if category exists
    const category = await Category.findById(data.categoryId);
    if (!category) {
      throw new AppError('Category not found', 400);
    }

    // Check if sector exists (if provided)
    if (data.sectorId) {
      const sector = await Sector.findById(data.sectorId);
      if (!sector) {
        throw new AppError('Sector not found', 400);
      }
    }

    // Check for duplicate shortName
    const existingService = await Service.findOne({ shortName: data.shortName });
    if (existingService) {
      throw new AppError('Service with this short name already exists', 409);
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
  } catch (error) {
    next(error);
  }
});

// PUT /api/services/:id - Update service
router.put('/:id', authMiddleware, validateBody(updateServiceSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;

    // Validate ObjectId format
    const parseResult = objectIdSchema.safeParse(id);
    if (!parseResult.success) {
      throw new AppError('Invalid service ID', 400);
    }

    // Check if category exists (if being updated)
    if (data.categoryId) {
      const category = await Category.findById(data.categoryId);
      if (!category) {
        throw new AppError('Category not found', 400);
      }
    }

    // Check if sector exists (if being updated)
    if (data.sectorId) {
      const sector = await Sector.findById(data.sectorId);
      if (!sector) {
        throw new AppError('Sector not found', 400);
      }
    }

    // Check for duplicate shortName (if being updated)
    if (data.shortName) {
      const existingService = await Service.findOne({
        shortName: data.shortName,
        _id: { $ne: id },
      });
      if (existingService) {
        throw new AppError('Service with this short name already exists', 409);
      }
    }

    const service = await Service.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true }
    )
      .populate('categoryId', 'name slug')
      .populate('sectorId', 'name slug category')
      .lean();

    if (!service) {
      throw new AppError('Service not found', 404);
    }

    res.json(service);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/services/:id - Delete service
router.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate ObjectId format
    const parseResult = objectIdSchema.safeParse(id);
    if (!parseResult.success) {
      throw new AppError('Invalid service ID', 400);
    }

    const service = await Service.findByIdAndDelete(id);

    if (!service) {
      throw new AppError('Service not found', 404);
    }

    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// POST /api/services/:id/versions - Add new version
router.post('/:id/versions', authMiddleware, validateBody(addVersionSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { version, dockerImage, releaseNotes } = req.body;

    // Validate ObjectId format
    const parseResult = objectIdSchema.safeParse(id);
    if (!parseResult.success) {
      throw new AppError('Invalid service ID', 400);
    }

    const service = await Service.findById(id);

    if (!service) {
      throw new AppError('Service not found', 404);
    }

    // Check for duplicate version
    const existingVersion = service.versions.find(v => v.version === version);
    if (existingVersion) {
      throw new AppError('Version already exists', 409);
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
  } catch (error) {
    next(error);
  }
});

export default router;
