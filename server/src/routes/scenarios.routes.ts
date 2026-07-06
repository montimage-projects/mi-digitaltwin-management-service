import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { Scenario } from '../models/Scenario.js';
import { Project } from '../models/Project.js';
import { Infrastructure } from '../models/Infrastructure.js';
import { Service } from '../models/Service.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateBody, objectIdSchema } from '../middleware/validation.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  buildClientFromInfrastructure,
  collectNewPodLogs,
  deployTopology,
  deriveNamespace,
  getDeploymentStatus,
  isDeploymentSettled,
  teardownDeployment,
  type ServiceImageSource,
} from '../services/kubernetesDeploy.js';

/** Interval between cluster status/log polls for the SSE progress stream. */
const SSE_POLL_INTERVAL_MS = 2000;

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

    const infrastructure = await Infrastructure.findById(scenario.infrastructureId);
    if (!infrastructure) {
      throw new AppError('Assigned infrastructure not found', 400);
    }

    // Resolve the services referenced by the topology nodes.
    const nodes = scenario.topology?.nodes ?? [];
    const serviceIds = [
      ...new Set(
        nodes
          .map((n) => (n as { data?: { serviceId?: string } }).data?.serviceId)
          .filter((sid): sid is string => Boolean(sid))
      ),
    ];
    const services = await Service.find({ _id: { $in: serviceIds } }).lean();

    // Create the execution record up front so we have an id for the namespace.
    scenario.executions.push({
      executedAt: new Date(),
      executedBy: user?.username || 'admin',
      status: 'pending',
      deployedServices: [],
    });
    await scenario.save();

    const execution = scenario.executions[scenario.executions.length - 1];
    const executionId = execution._id!.toString();
    const namespace = deriveNamespace(id, executionId);

    try {
      const clients = buildClientFromInfrastructure(infrastructure);
      const result = await deployTopology(clients, {
        namespace,
        nodes,
        services: services as unknown as ServiceImageSource[],
        endpoint: infrastructure.endpoint,
      });

      execution.namespace = result.namespace;
      execution.status = 'running';
      execution.deployedServices = result.services.map((s) => ({
        serviceId:
          s.serviceId as unknown as (typeof execution.deployedServices)[number]['serviceId'],
        nodeId: s.nodeId,
        name: s.name,
        uiType: s.uiType,
        status: s.status,
        dashboardUrl: s.dashboardUrl,
      }));
      await scenario.save();

      res.json({
        executionId,
        namespace: result.namespace,
        status: execution.status,
        services: result.services,
      });
    } catch (deployError) {
      // Surface the deploy failure but leave a durable, failed execution record.
      execution.namespace = namespace;
      execution.status = 'failed';
      await scenario.save();
      throw deployError;
    }
  } catch (error) {
    next(error);
  }
});

// DELETE /api/scenarios/:id/executions/:executionId - Tear down a deployment
router.delete('/scenarios/:id/executions/:executionId', authMiddleware, async (req, res, next) => {
  try {
    const { id, executionId } = req.params;

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

    // Only reach the cluster when something was actually deployed.
    if (execution.namespace) {
      const infrastructure = await Infrastructure.findById(scenario.infrastructureId);
      if (!infrastructure) {
        throw new AppError('Assigned infrastructure not found', 400);
      }
      const clients = buildClientFromInfrastructure(infrastructure);
      await teardownDeployment(clients, execution.namespace);
    }

    execution.status = 'completed';
    await scenario.save();

    res.json({
      executionId,
      namespace: execution.namespace,
      status: execution.status,
      message: 'Deployment torn down',
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/scenarios/:id/executions/:executionId/events - Stream deploy progress + logs (SSE)
router.get(
  '/scenarios/:id/executions/:executionId/events',
  authMiddleware,
  async (req, res, next) => {
    try {
      const { id, executionId } = req.params;

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

      const namespace = execution.namespace;
      const names = (execution.deployedServices ?? [])
        .map((s) => s.name)
        .filter((n): n is string => Boolean(n));

      // Nothing was deployed, or the execution has already reached a terminal
      // state — there is nothing to poll for. Emit a single snapshot and close.
      const terminal =
        !namespace ||
        names.length === 0 ||
        execution.status === 'completed' ||
        execution.status === 'failed';

      // Build the cluster client (may throw on bad credentials) *before*
      // switching the response to an event stream, so a failure returns a
      // normal JSON error rather than a half-open SSE connection.
      const infrastructure = terminal
        ? null
        : await Infrastructure.findById(scenario.infrastructureId);
      if (!terminal && !infrastructure) {
        throw new AppError('Assigned infrastructure not found', 400);
      }
      const clients = infrastructure ? buildClientFromInfrastructure(infrastructure) : null;

      // Switch to a Server-Sent Events stream. `no-transform` opts this response
      // out of the global compression() middleware's buffering; `X-Accel-Buffering`
      // disables buffering in reverse proxies (e.g. nginx).
      res.status(200).set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();

      let closed = false;
      let timer: ReturnType<typeof setInterval> | undefined;

      const send = (event: string, data: unknown): void => {
        if (closed) return;
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      const cleanup = (): void => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        timer = undefined;
        res.end();
      };

      // Client disconnect: stop polling and close any pending work.
      req.on('close', cleanup);

      if (terminal || !clients || !namespace) {
        send('progress', { status: execution.status, progress: 0, services: [] });
        send('end', { status: execution.status });
        cleanup();
        return;
      }

      const seen = new Map<string, number>();

      const poll = async (): Promise<void> => {
        if (closed) return;
        try {
          const { statuses, progress } = await getDeploymentStatus(clients, { namespace, names });
          send('progress', { progress, services: statuses });

          const logs = await collectNewPodLogs(clients, { namespace, names, seen });
          for (const entry of logs) {
            send('log', { service: entry.name, pod: entry.pod, line: entry.line });
          }

          if (isDeploymentSettled(statuses)) {
            const status = statuses.some((s) => s.status === 'failed') ? 'failed' : 'completed';
            send('end', { status, services: statuses });
            cleanup();
          }
        } catch (err) {
          send('error', { message: err instanceof Error ? err.message : String(err) });
          cleanup();
        }
      };

      // Emit an immediate snapshot, then poll on an interval until settled or
      // the client disconnects.
      await poll();
      if (!closed) {
        timer = setInterval(() => {
          void poll();
        }, SSE_POLL_INTERVAL_MS);
      }
    } catch (error) {
      next(error);
    }
  }
);

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
