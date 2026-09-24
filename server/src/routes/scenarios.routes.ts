import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
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
import { ExecutionReport } from '../models/ExecutionReport.js';
import {
  buildProvisionalReport,
  captureReport,
  renderHtml,
  renderMarkdown,
  toReportData,
} from '../services/executionReport.js';

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

/**
 * Per-node config overrides — task 0.4 of the Montimage attack→detect→respond
 * plan (docs/playbooks/montimage-attack-detect-respond-plan.md). A scenario may
 * override the service catalog's `deployment` defaults without editing the
 * catalog (e.g. selecting a MAG attack profile via `args`). `env` mirrors
 * `IDeploymentSpec.env` entries. `looseObject` at every level preserves keys
 * the schema does not know (React Flow fields, future override fields like
 * `configFiles`) so saved topologies reload intact.
 */
const nodeConfigEnvSchema = z.looseObject({
  name: z.string().min(1),
  value: z.string().optional(),
  fromEdge: z.enum(['target', 'reaction']).optional(),
});

const nodeConfigSchema = z.looseObject({
  env: z.array(nodeConfigEnvSchema).optional(),
  args: z.array(z.string()).optional(),
});

const topologyNodeSchema = z.looseObject({
  data: z
    .looseObject({
      config: nodeConfigSchema.optional(),
    })
    .optional(),
});

const topologySchema = z.object({
  yaml: z.string().default(''),
  nodes: z.array(topologyNodeSchema).default([]),
  edges: z.array(z.record(z.string(), z.unknown())).default([]),
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
// Excludes heavy fields (topology, executions) from list responses.
// Use GET /api/scenarios/:id for the full detail payload.
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

    // Slim response: exclude topology and executions arrays.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slimScenarios = (scenarios as any[]).map((scenario) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { topology, executions, ...rest } = scenario;
      const latestExecution = scenario.executions?.length
        ? {
            status: scenario.executions[scenario.executions.length - 1].status,
            executedAt: scenario.executions[scenario.executions.length - 1].executedAt,
            executedBy: scenario.executions[scenario.executions.length - 1].executedBy,
          }
        : null;
      return { ...rest, latestExecution };
    });

    res.json(slimScenarios);
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
    const user = req.user!;

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
    const clients =
      execution.namespace && scenario.infrastructureId
        ? buildClientFromInfrastructure(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (await findById(Infrastructure, scenario.infrastructureId.toString())) as any
          )
        : null;

    // Close the run with a report (issue #26) *before* the namespace — and
    // with it every pod log and event — is deleted. The outcome is computed
    // from the status the run had before teardown; capture is bounded by a
    // timeout and never throws, so a slow or failing cluster read yields a
    // partial report rather than blocking the teardown.
    const closed = await captureReport({ clients, scenario, execution });

    if (clients && execution.namespace) {
      await teardownDeployment(clients, execution.namespace);
    }

    // Positional atomic update so a concurrent write to another execution of
    // this scenario is not overwritten by a whole-document save().
    await Scenario.findOneAndUpdate(
      { _id: id, 'executions._id': new mongoose.Types.ObjectId(executionId) },
      {
        $set: {
          'executions.$.status': 'completed',
          'executions.$.completedAt': closed.completedAt,
          'executions.$.durationMs': closed.durationMs,
          'executions.$.outcome': closed.outcome,
        },
      }
    );

    res.json({
      executionId,
      namespace: execution.namespace,
      status: 'completed',
      outcome: closed.outcome,
      durationMs: closed.durationMs,
      message: 'Deployment torn down',
    });
  })
);

const REPORT_FORMATS = ['json', 'md', 'html'] as const;
type ReportFormat = (typeof REPORT_FORMATS)[number];

// GET /api/scenarios/:id/executions/:executionId/report - Execution report (issue #26)
// `?format=json|md|html` (default json). Serves the report stored when the run
// closed; a run with no stored report gets a provisional one built from the
// embedded execution fields only — this endpoint never reads the cluster.
router.get(
  '/scenarios/:id/executions/:executionId/report',
  authMiddleware,
  validateObjectIdParam,
  asyncHandler(async (req, res) => {
    const { id, executionId } = req.params;

    if (!/^[0-9a-fA-F]{24}$/.test(executionId)) {
      throw new AppError('Invalid ID format', 400);
    }

    const rawFormat = req.query.format ?? 'json';
    if (typeof rawFormat !== 'string' || !REPORT_FORMATS.includes(rawFormat as ReportFormat)) {
      throw new AppError(
        `Invalid report format; expected one of ${REPORT_FORMATS.join(', ')}`,
        400
      );
    }
    const format = rawFormat as ReportFormat;

    const scenario = await Scenario.findById(id).lean();
    if (!scenario) throw new AppError('Scenario not found', 404);

    const execution = scenario.executions.find((e) => e._id?.toString() === executionId);
    if (!execution) throw new AppError('Execution not found', 404);

    const stored = await ExecutionReport.findOne({ scenarioId: id, executionId }).lean();
    const report = stored
      ? toReportData(stored, execution.status)
      : buildProvisionalReport(scenario, execution);

    if (format === 'json') {
      res.json(report);
      return;
    }

    // The filename is built only from the validated hex execution id — never
    // from user-controlled text such as the scenario title.
    const filename = `execution-${executionId}-report.${format}`;
    res.set('Content-Disposition', `attachment; filename="${filename}"`);

    if (format === 'md') {
      res.type('text/markdown; charset=utf-8').send(renderMarkdown(report));
      return;
    }

    // Script-free page: lock it down even if opened in place of downloading.
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.type('text/html; charset=utf-8').send(renderHtml(report));
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
