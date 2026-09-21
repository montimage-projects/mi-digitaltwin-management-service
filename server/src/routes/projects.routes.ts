import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { Project } from '../models/Project.js';
import { Scenario } from '../models/Scenario.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateBody, validateQuery, objectIdSchema } from '../middleware/validation.js';
import {
  asyncHandler,
  findById,
  findByIdAndUpdate,
  findByIdAndDelete,
  validateObjectIdParam,
} from '../middleware/entityLoader.js';
import { buildCaseInsensitiveFilter, buildSearchOrFilter } from '../utils/search.js';

const router: RouterType = Router();

/** Fields a free-text `?search=` term is matched against. */
const SEARCH_FIELDS = ['shortName', 'title', 'description'] as const;

// Validation schemas
const createProjectSchema = z.object({
  shortName: z
    .string()
    .min(1)
    .max(50)
    .transform((val) => val.toUpperCase()),
  title: z.string().min(1).max(200),
  sector: z.enum(['Telecommunications', 'Healthcare', 'Transportation', 'Nuclear', 'Cross-Sector']),
  leader: z.string().min(1).max(100),
  involvedPartners: z.array(z.string().max(50)).default([]),
  description: z.string().max(2000).optional(),
  isComposite: z.boolean().default(false),
  atomicProjectIds: z
    .array(z.string().refine((val) => objectIdSchema.safeParse(val).success))
    .default([]),
});

const updateProjectSchema = createProjectSchema.partial();

const listProjectsSchema = z.object({
  sector: z
    .enum(['Telecommunications', 'Healthcare', 'Transportation', 'Nuclear', 'Cross-Sector'])
    .optional(),
  leader: z.string().optional(),
  search: z.string().optional(),
});

// GET /api/projects - List all projects
router.get(
  '/',
  authMiddleware,
  validateQuery(listProjectsSchema),
  asyncHandler(async (req, res) => {
    const { sector, leader, search } = req.query as z.infer<typeof listProjectsSchema>;

    const query: Record<string, unknown> = {};

    if (sector) {
      query.sector = sector;
    }

    if (leader) {
      query.leader = buildCaseInsensitiveFilter(leader);
    }

    if (search) {
      query.$or = buildSearchOrFilter(SEARCH_FIELDS, search);
    }

    const projects = await Project.find(query)
      .populate('atomicProjectIds', 'shortName title sector')
      .sort({ updatedAt: -1 })
      .lean();

    // Get scenario counts for each project
    const projectIds = projects.map((p) => p._id);
    const scenarioCounts = await Scenario.aggregate([
      { $match: { projectId: { $in: projectIds } } },
      { $group: { _id: '$projectId', count: { $sum: 1 } } },
    ]);

    const countMap = new Map(scenarioCounts.map((sc) => [sc._id.toString(), sc.count]));

    const projectsWithCounts = projects.map((project) => ({
      ...project,
      scenarioCount: countMap.get(project._id.toString()) || 0,
    }));

    res.json(projectsWithCounts);
  })
);

// POST /api/projects - Create new project
router.post(
  '/',
  authMiddleware,
  validateBody(createProjectSchema),
  asyncHandler(async (req, res) => {
    const data = req.body;

    // Check for duplicate shortName
    const existingProject = await Project.findOne({ shortName: data.shortName });
    if (existingProject) {
      throw new Error('Project with this short name already exists');
    }

    // Validate atomic projects for composite
    if (data.isComposite && data.atomicProjectIds?.length > 0) {
      const atomicProjects = await Project.find({
        _id: { $in: data.atomicProjectIds },
        isComposite: false,
      });
      if (atomicProjects.length !== data.atomicProjectIds.length) {
        throw new Error('Some atomic projects not found or are composite');
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
  })
);

// GET /api/projects/:id - Get project detail
router.get(
  '/:id',
  authMiddleware,
  validateObjectIdParam,
  asyncHandler(async (req, res) => {
    const project = await findById(Project, req.params.id, 'atomicProjectIds');

    // Scenarios will be fetched separately via /api/projects/:id/scenarios
    res.json(project);
  })
);

// PUT /api/projects/:id - Update project
router.put(
  '/:id',
  authMiddleware,
  validateObjectIdParam,
  validateBody(updateProjectSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = req.body;

    // Check for duplicate shortName
    if (data.shortName) {
      const existingProject = await Project.findOne({
        shortName: data.shortName,
        _id: { $ne: id },
      });
      if (existingProject) {
        throw new Error('Project with this short name already exists');
      }
    }

    // Validate atomic projects for composite
    if (data.atomicProjectIds?.length > 0) {
      const atomicProjects = await Project.find({
        _id: { $in: data.atomicProjectIds },
        isComposite: false,
      });
      if (atomicProjects.length !== data.atomicProjectIds.length) {
        throw new Error('Some atomic projects not found or are composite');
      }
    }

    const project = await findByIdAndUpdate(
      Project,
      id,
      { $set: data },
      { new: true, runValidators: true },
      'atomicProjectIds'
    );

    res.json(project);
  })
);

// DELETE /api/projects/:id - Delete project
router.delete(
  '/:id',
  authMiddleware,
  validateObjectIdParam,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if project is referenced by other composite projects
    const referencingProjects = await Project.findOne({ atomicProjectIds: id });
    if (referencingProjects) {
      throw new Error('Cannot delete project: it is referenced by a composite project');
    }

    await findByIdAndDelete(Project, id);

    res.json({ message: 'Project deleted successfully' });
  })
);

export default router;
