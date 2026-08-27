import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { Scenario } from '../models/Scenario.js';
import { Project } from '../models/Project.js';
import { Infrastructure } from '../models/Infrastructure.js';
import { Service } from '../models/Service.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateBody, objectIdSchema } from '../middleware/validation.js';
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
import { asyncHandler, findById, validateObjectIdParam } from '../middleware/entityLoader.js';
import { AppError } from '../middleware/errorHandler.js';

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clients = buildClientFromInfrastructure(infrastructure as any);
      const result = await deployTopology(clients, {
        namespace,
        nodes,
        services: services as unknown as ServiceImageSource[],
        endpoint: infrastructure.endpoint as string,
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

    if (!scenario) {
      throw new Error('Scenario not found');
    }

    const execution = scenario.executions.find((e) => e._id?.toString() === executionId);
    if (!execution) {
      throw new AppError('Execution not found', 404);
    }

    // Only reach the cluster when something was actually deployed.
    if (execution.namespace && scenario.infrastructureId) {
      const infrastructure = await findById(Infrastructure, scenario.infrastructureId.toString());
      const infra = infrastructure as {
        endpoint: string;
        credentials: { iv: string; encrypted: string; authTag: string };
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clients = buildClientFromInfrastructure(infra as any);
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

    if (!scenario) {
      throw new Error('Scenario not found');
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
    const infrastructure =
      terminal || !scenario.infrastructureId
        ? null
        : await findById(Infrastructure, scenario.infrastructureId.toString());

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

    if (terminal || !names.length) {
      send('progress', { status: execution.status, progress: 0, services: [] });
      send('end', { status: execution.status });
      cleanup();
      return;
    }

    if (!infrastructure) {
      throw new Error('Assigned infrastructure not found');
    }

    const infra = infrastructure as {
      endpoint: string;
      credentials: { iv: string; encrypted: string; authTag: string };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clients = buildClientFromInfrastructure(infra as any);

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
