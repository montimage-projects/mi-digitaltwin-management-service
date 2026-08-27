import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { Scenario } from '../models/Scenario.js';
import { Project } from '../models/Project.js';
import { Infrastructure } from '../models/Infrastructure.js';
import { Service } from '../models/Service.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateBody, objectIdSchema } from '../middleware/validation.js';
import { buildClientFromInfrastructure, teardownDeployment } from '../services/kubernetesDeploy.js';
import { asyncHandler, findById, validateObjectIdParam } from '../middleware/entityLoader.js';
import { AppError } from '../middleware/errorHandler.js';
import { executeScenario } from '../services/scenarioExecution.js';
import { runSSEStream } from '../services/scenarioSSE.js';

/** Extract unique service IDs from a scenario's topology nodes. */
function resolveServiceIds(scenario: { topology?: { nodes?: unknown[] } }): string[] {
  const nodes = scenario.topology?.nodes ?? [];
  return [
    ...new Set(
      nodes
        .map((n) => (n as { data?: { serviceId?: string } }).data?.serviceId)
        .filter((sid): sid is string => Boolean(sid))
    ),
  ];
}

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

// GET /api/projects/:projectId/scenarios - List scenarios for a project
router.get(
  '/projects/:projectId/scenarios',
  authMiddleware,
  validateObjectIdParam,
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;

    await findById(Project, projectId);

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
  })
);

// POST /api/projects/:projectId/scenarios - Create scenario
router.post(
  '/projects/:projectId/scenarios',
  authMiddleware,
  validateObjectIdParam,
  validateBody(createScenarioSchema),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const data = req.body;

    await findById(Project, projectId);

    const scenario = new Scenario({
      ...data,
      projectId,
    });
    await scenario.save();

    const populatedScenario = await Scenario.findById(scenario._id)
      .populate('infrastructureId', 'name type status')
      .lean();

    res.status(201).json(populatedScenario);
  })
);

// GET /api/scenarios/:id - Get scenario detail
router.get(
  '/scenarios/:id',
  authMiddleware,
  validateObjectIdParam,
  asyncHandler(async (req, res) => {
    const scenario = await findById(Scenario, req.params.id, [
      { path: 'projectId', select: 'shortName title sector' },
      { path: 'infrastructureId', select: 'name type status endpoint' },
      { path: 'executions.deployedServices.serviceId', select: 'shortName title' },
    ]);

    res.json(scenario);
  })
);

// PUT /api/scenarios/:id - Update scenario
router.put(
  '/scenarios/:id',
  authMiddleware,
  validateObjectIdParam,
  validateBody(updateScenarioSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = req.body;

    const scenario = await Scenario.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true }
    )
      .populate('infrastructureId', 'name type status')
      .lean();

    res.json(scenario);
  })
);

// DELETE /api/scenarios/:id - Delete scenario
router.delete(
  '/scenarios/:id',
  authMiddleware,
  validateObjectIdParam,
  asyncHandler(async (req, res) => {
    await Scenario.findByIdAndDelete(req.params.id);
    res.json({ message: 'Scenario deleted successfully' });
  })
);

// POST /api/scenarios/:id/execute - Trigger execution
router.post(
  '/scenarios/:id/execute',
  authMiddleware,
  validateObjectIdParam,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = (req as unknown as { user: { username: string } }).user;

    const scenario = await Scenario.findById(id);

    if (!scenario) {
      throw new Error('Scenario not found');
    }

    if (!scenario.infrastructureId) {
      throw new AppError('Scenario has no infrastructure assigned', 400);
    }

    const infrastructure = await findById(Infrastructure, scenario.infrastructureId.toString());

    // Resolve the services referenced by the topology nodes.
    const serviceIds = resolveServiceIds(scenario);
    const services = await Service.find({ _id: { $in: serviceIds } }).lean();

    // Atomically push a new execution record using $push with positional
    // operator, so concurrent POSTs each get their own execution slot.
    const pushResult = await Scenario.findOneAndUpdate(
      { _id: id },
      {
        $push: {
          executions: {
            executedAt: new Date(),
            executedBy: user?.username || 'admin',
            status: 'pending',
            deployedServices: [],
          },
        },
      },
      { new: true }
    );

    if (!pushResult) {
      throw new Error('Scenario not found');
    }

    const infraForExec = {
      endpoint: String(infrastructure.endpoint),
      credentials: infrastructure.credentials as { iv: string; encrypted: string; authTag: string },
    };
    const result = await executeScenario(pushResult, infraForExec, services);

    res.json(result);
  })
);

// DELETE /api/scenarios/:id/executions/:executionId - Tear down a deployment
router.delete(
  '/scenarios/:id/executions/:executionId',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { id, executionId } = req.params;

    if (!/^[0-9a-fA-F]{24}$/.test(id) || !/^[0-9a-fA-F]{24}$/.test(executionId)) {
      throw new Error('Invalid ID format');
    }

    const scenario = await Scenario.findById(id);
    if (!scenario) throw new Error('Scenario not found');

    const execution = scenario.executions.find((e) => e._id?.toString() === executionId);
    if (!execution) throw new AppError('Execution not found', 404);

    // Only reach the cluster when something was actually deployed.
    if (execution.namespace && scenario.infrastructureId) {
      const infra = await findById(Infrastructure, scenario.infrastructureId.toString());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await teardownDeployment(buildClientFromInfrastructure(infra as any), execution.namespace);
    }

    execution.status = 'completed';
    await scenario.save();

    res.json({
      executionId,
      namespace: execution.namespace,
      status: execution.status,
      message: 'Deployment torn down',
    });
  })
);

// GET /api/scenarios/:id/executions/:executionId/events - Stream deploy progress + logs (SSE)
router.get(
  '/scenarios/:id/executions/:executionId/events',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { id, executionId } = req.params;

    if (!/^[0-9a-fA-F]{24}$/.test(id) || !/^[0-9a-fA-F]{24}$/.test(executionId)) {
      throw new Error('Invalid ID format');
    }

    const scenario = await Scenario.findById(id);
    if (!scenario) throw new Error('Scenario not found');

    const execution = scenario.executions.find((e) => e._id?.toString() === executionId);
    if (!execution) throw new AppError('Execution not found', 404);

    // Build the cluster client before switching to SSE, so a failure returns
    // a normal JSON error rather than a half-open stream.
    const infrastructure = scenario.infrastructureId
      ? await findById(Infrastructure, scenario.infrastructureId.toString())
      : null;

    // Switch to Server-Sent Events stream, bypassing compression/buffering.
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const infraView = infrastructure
      ? {
          endpoint: String(infrastructure.endpoint),
          credentials: infrastructure.credentials as {
            iv: string;
            encrypted: string;
            authTag: string;
          },
        }
      : null;
    const cleanup = runSSEStream(res, scenario, execution, infraView);

    req.on('close', cleanup);
  })
);

// PUT /api/scenarios/:id/executions/:executionId/status - Update execution status
router.put(
  '/scenarios/:id/executions/:executionId/status',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { id, executionId } = req.params;
    const { status } = req.body;

    if (!/^[0-9a-fA-F]{24}$/.test(id) || !/^[0-9a-fA-F]{24}$/.test(executionId)) {
      throw new Error('Invalid ID format');
    }

    const scenario = await Scenario.findById(id);

    if (!scenario) {
      throw new Error('Scenario not found');
    }

    const execution = scenario.executions.find((e) => e._id?.toString() === executionId);
    if (!execution) {
      throw new Error('Execution not found');
    }

    execution.status = status;

    await scenario.save();

    res.json(execution);
  })
);

// POST /api/scenarios/:id/executions/:executionId/conclusion - Add conclusion
router.post(
  '/scenarios/:id/executions/:executionId/conclusion',
  authMiddleware,
  validateBody(conclusionSchema),
  asyncHandler(async (req, res) => {
    const { id, executionId } = req.params;
    const { text, author } = req.body;

    if (!/^[0-9a-fA-F]{24}$/.test(id) || !/^[0-9a-fA-F]{24}$/.test(executionId)) {
      throw new Error('Invalid ID format');
    }

    const scenario = await Scenario.findById(id);

    if (!scenario) {
      throw new Error('Scenario not found');
    }

    const execution = scenario.executions.find((e) => e._id?.toString() === executionId);
    if (!execution) {
      throw new Error('Execution not found');
    }

    execution.conclusion = {
      text,
      author,
      createdAt: new Date(),
    };

    await scenario.save();

    res.json(execution);
  })
);

export default router;
