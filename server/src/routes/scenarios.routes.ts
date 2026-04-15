import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { Scenario } from '../models/Scenario.js';
import { Project } from '../models/Project.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateBody, objectIdSchema } from '../middleware/validation.js';
import { AppError } from '../middleware/errorHandler.js';

const router: RouterType = Router();

// Validation schemas
const topologySchema = z.object({
  yaml: z.string().default(''),
  nodes: z.array(z.record(z.unknown())).default([]),
  edges: z.array(z.record(z.unknown())).default([]),
});

const createScenarioSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  topology: topologySchema.optional(),
  infrastructureId: z
    .string()
    .refine((val) => !val || objectIdSchema.safeParse(val).success, 'Invalid infrastructure ID')
    .optional(),
});

const updateScenarioSchema = createScenarioSchema.partial();

const conclusionSchema = z.object({
  text: z.string().min(1),
  author: z.string().min(1),
});

const updateExecutionStatusSchema = z.object({
  status: z.enum(['pending', 'running', 'completed', 'failed']),
});

// GET /api/projects/:projectId/scenarios - List scenarios for a project
router.get('/projects/:projectId/scenarios', authMiddleware, async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const parseResult = objectIdSchema.safeParse(projectId);
    if (!parseResult.success) {
      throw new AppError('Invalid project ID', 400);
    }

    const project = await Project.findById(projectId);
    if (!project) {
      throw new AppError('Project not found', 404);
    }

    const scenarios = await Scenario.find({ projectId })
      .populate('infrastructureId', 'name type status')
      .sort({ updatedAt: -1 })
      .lean();

    // Add latest execution status to each scenario
    const scenariosWithStatus = scenarios.map((scenario) => {
      const latestExecution = scenario.executions[scenario.executions.length - 1];
      return {
        ...scenario,
        latestExecution: latestExecution
          ? {
              status: latestExecution.status,
              executedAt: latestExecution.executedAt,
              executedBy: latestExecution.executedBy,
            }
          : null,
      };
    });

    res.json(scenariosWithStatus);
  } catch (error) {
    next(error);
  }
});

// POST /api/projects/:projectId/scenarios - Create scenario
router.post(
  '/projects/:projectId/scenarios',
  authMiddleware,
  validateBody(createScenarioSchema),
  async (req, res, next) => {
    try {
      const { projectId } = req.params;
      const data = req.body;

      const parseResult = objectIdSchema.safeParse(projectId);
      if (!parseResult.success) {
        throw new AppError('Invalid project ID', 400);
      }

      const project = await Project.findById(projectId);
      if (!project) {
        throw new AppError('Project not found', 404);
      }

      const scenario = new Scenario({
        ...data,
        projectId,
      });
      await scenario.save();

      const populatedScenario = await Scenario.findById(scenario._id)
        .populate('infrastructureId', 'name type status')
        .lean();

      res.status(201).json(populatedScenario);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/scenarios/:id - Get scenario detail
router.get('/scenarios/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;

    const parseResult = objectIdSchema.safeParse(id);
    if (!parseResult.success) {
      throw new AppError('Invalid scenario ID', 400);
    }

    const scenario = await Scenario.findById(id)
      .populate('projectId', 'shortName title sector')
      .populate('infrastructureId', 'name type status endpoint')
      .populate('executions.deployedServices.serviceId', 'shortName title')
      .lean();

    if (!scenario) {
      throw new AppError('Scenario not found', 404);
    }

    res.json(scenario);
  } catch (error) {
    next(error);
  }
});

// PUT /api/scenarios/:id - Update scenario
router.put(
  '/scenarios/:id',
  authMiddleware,
  validateBody(updateScenarioSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const data = req.body;

      const parseResult = objectIdSchema.safeParse(id);
      if (!parseResult.success) {
        throw new AppError('Invalid scenario ID', 400);
      }

      const scenario = await Scenario.findByIdAndUpdate(
        id,
        { $set: data },
        { new: true, runValidators: true }
      )
        .populate('infrastructureId', 'name type status')
        .lean();

      if (!scenario) {
        throw new AppError('Scenario not found', 404);
      }

      res.json(scenario);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/scenarios/:id - Delete scenario
router.delete('/scenarios/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;

    const parseResult = objectIdSchema.safeParse(id);
    if (!parseResult.success) {
      throw new AppError('Invalid scenario ID', 400);
    }

    const scenario = await Scenario.findByIdAndDelete(id);

    if (!scenario) {
      throw new AppError('Scenario not found', 404);
    }

    res.json({ message: 'Scenario deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// POST /api/scenarios/:id/execute - Trigger execution
router.post('/scenarios/:id/execute', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = (req as unknown as { user: { username: string } }).user;

    const parseResult = objectIdSchema.safeParse(id);
    if (!parseResult.success) {
      throw new AppError('Invalid scenario ID', 400);
    }

    const scenario = await Scenario.findById(id);

    if (!scenario) {
      throw new AppError('Scenario not found', 404);
    }

    if (!scenario.infrastructureId) {
      throw new AppError('Scenario has no infrastructure assigned', 400);
    }

    // Create execution record
    const execution = {
      executedAt: new Date(),
      executedBy: user?.username || 'admin',
      status: 'pending' as const,
      deployedServices: [],
    };

    scenario.executions.push(execution);
    await scenario.save();

    const executionId = scenario.executions[scenario.executions.length - 1]._id;

    res.json({
      executionId,
      status: 'pending',
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/scenarios/:id/executions/:executionId/status - Update execution status
router.put(
  '/scenarios/:id/executions/:executionId/status',
  authMiddleware,
  validateBody(updateExecutionStatusSchema),
  async (req, res, next) => {
    try {
      const { id, executionId } = req.params;
      const { status } = req.body;

      const parseResult1 = objectIdSchema.safeParse(id);
      const parseResult2 = objectIdSchema.safeParse(executionId);
      if (!parseResult1.success || !parseResult2.success) {
        throw new AppError('Invalid ID', 400);
      }

      const scenario = await Scenario.findById(id);

      if (!scenario) {
        throw new AppError('Scenario not found', 404);
      }

      const execution = scenario.executions.find((e) => e._id?.toString() === executionId);
      if (!execution) {
        throw new AppError('Execution not found', 404);
      }

      execution.status = status;

      await scenario.save();

      res.json(execution);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/scenarios/:id/executions/:executionId/conclusion - Add conclusion
router.post(
  '/scenarios/:id/executions/:executionId/conclusion',
  authMiddleware,
  validateBody(conclusionSchema),
  async (req, res, next) => {
    try {
      const { id, executionId } = req.params;
      const { text, author } = req.body;

      const parseResult1 = objectIdSchema.safeParse(id);
      const parseResult2 = objectIdSchema.safeParse(executionId);
      if (!parseResult1.success || !parseResult2.success) {
        throw new AppError('Invalid ID', 400);
      }

      const scenario = await Scenario.findById(id);

      if (!scenario) {
        throw new AppError('Scenario not found', 404);
      }

      const execution = scenario.executions.find((e) => e._id?.toString() === executionId);
      if (!execution) {
        throw new AppError('Execution not found', 404);
      }

      execution.conclusion = {
        text,
        author,
        createdAt: new Date(),
      };

      await scenario.save();

      res.json(execution);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
