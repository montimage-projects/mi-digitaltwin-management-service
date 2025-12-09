import { Router } from 'express';
import { z } from 'zod';
import { Project } from '../models/Project.js';
import { Scenario } from '../models/Scenario.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateBody, validateQuery, objectIdSchema } from '../middleware/validation.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// Validation schemas
const createProjectSchema = z.object({
  shortName: z.string().min(1).max(50).transform(val => val.toUpperCase()),
  title: z.string().min(1).max(200),
  sector: z.enum(['Telecommunications', 'Healthcare', 'Transportation', 'Nuclear', 'Cross-Sector']),
  leader: z.string().min(1).max(100),
  involvedPartners: z.array(z.string().max(50)).default([]),
  description: z.string().max(2000).optional(),
  isComposite: z.boolean().default(false),
  atomicProjectIds: z.array(z.string().refine(val => objectIdSchema.safeParse(val).success)).default([]),
});

const updateProjectSchema = createProjectSchema.partial();

const listProjectsSchema = z.object({
  sector: z.enum(['Telecommunications', 'Healthcare', 'Transportation', 'Nuclear', 'Cross-Sector']).optional(),
  leader: z.string().optional(),
  search: z.string().optional(),
});

// GET /api/projects - List all projects
router.get('/', authMiddleware, validateQuery(listProjectsSchema), async (req, res, next) => {
  try {
    const { sector, leader, search } = req.query as z.infer<typeof listProjectsSchema>;

    const query: Record<string, unknown> = {};

    if (sector) {
      query.sector = sector;
    }

    if (leader) {
      query.leader = { $regex: new RegExp(leader, 'i') };
    }

    if (search) {
      query.$or = [
        { shortName: { $regex: new RegExp(search, 'i') } },
        { title: { $regex: new RegExp(search, 'i') } },
        { description: { $regex: new RegExp(search, 'i') } },
      ];
    }

    const projects = await Project.find(query)
      .populate('atomicProjectIds', 'shortName title sector')
      .sort({ updatedAt: -1 })
      .lean();

    // Get scenario counts for each project
    const projectIds = projects.map(p => p._id);
    const scenarioCounts = await Scenario.aggregate([
      { $match: { projectId: { $in: projectIds } } },
      { $group: { _id: '$projectId', count: { $sum: 1 } } }
    ]);

    const countMap = new Map(scenarioCounts.map(sc => [sc._id.toString(), sc.count]));

    const projectsWithCounts = projects.map(project => ({
      ...project,
      scenarioCount: countMap.get(project._id.toString()) || 0,
    }));

    res.json(projectsWithCounts);
  } catch (error) {
    next(error);
  }
});

// POST /api/projects - Create new project
router.post('/', authMiddleware, validateBody(createProjectSchema), async (req, res, next) => {
  try {
    const data = req.body;

    // Check for duplicate shortName
    const existingProject = await Project.findOne({ shortName: data.shortName });
    if (existingProject) {
      throw new AppError('Project with this short name already exists', 409);
    }

    // Validate atomic projects for composite
    if (data.isComposite && data.atomicProjectIds?.length > 0) {
      const atomicProjects = await Project.find({
        _id: { $in: data.atomicProjectIds },
        isComposite: false,
      });
      if (atomicProjects.length !== data.atomicProjectIds.length) {
        throw new AppError('Some atomic projects not found or are composite', 400);
      }
    }

    // Cross-sector projects must be composite
    if (data.sector === 'Cross-Sector' && !data.isComposite) {
      data.isComposite = true;
    }

    const project = new Project(data);
    await project.save();

    const populatedProject = await Project.findById(project._id)
      .populate('atomicProjectIds', 'shortName title sector')
      .lean();

    res.status(201).json(populatedProject);
  } catch (error) {
    next(error);
  }
});

// GET /api/projects/:id - Get project detail
router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;

    const parseResult = objectIdSchema.safeParse(id);
    if (!parseResult.success) {
      throw new AppError('Invalid project ID', 400);
    }

    const project = await Project.findById(id)
      .populate('atomicProjectIds', 'shortName title sector')
      .lean();

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    // Scenarios will be fetched separately via /api/projects/:id/scenarios
    res.json(project);
  } catch (error) {
    next(error);
  }
});

// PUT /api/projects/:id - Update project
router.put('/:id', authMiddleware, validateBody(updateProjectSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const parseResult = objectIdSchema.safeParse(id);
    if (!parseResult.success) {
      throw new AppError('Invalid project ID', 400);
    }

    // Check for duplicate shortName
    if (data.shortName) {
      const existingProject = await Project.findOne({
        shortName: data.shortName,
        _id: { $ne: id },
      });
      if (existingProject) {
        throw new AppError('Project with this short name already exists', 409);
      }
    }

    // Validate atomic projects for composite
    if (data.atomicProjectIds?.length > 0) {
      const atomicProjects = await Project.find({
        _id: { $in: data.atomicProjectIds },
        isComposite: false,
      });
      if (atomicProjects.length !== data.atomicProjectIds.length) {
        throw new AppError('Some atomic projects not found or are composite', 400);
      }
    }

    const project = await Project.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true }
    ).populate('atomicProjectIds', 'shortName title sector').lean();

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    res.json(project);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/projects/:id - Delete project
router.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;

    const parseResult = objectIdSchema.safeParse(id);
    if (!parseResult.success) {
      throw new AppError('Invalid project ID', 400);
    }

    // Check if project has scenarios (will be implemented when Scenario model exists)
    // For now, allow deletion

    // Check if project is referenced by other composite projects
    const referencingProjects = await Project.findOne({ atomicProjectIds: id });
    if (referencingProjects) {
      throw new AppError('Cannot delete project: it is referenced by a composite project', 400);
    }

    const project = await Project.findByIdAndDelete(id);

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
