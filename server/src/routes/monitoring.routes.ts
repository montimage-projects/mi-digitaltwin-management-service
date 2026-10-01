import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import {
  AlertRule,
  ALERT_METRICS,
  ALERT_OPERATORS,
  ALERT_SEVERITIES,
} from '../models/AlertRule.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { validateBody, validateQuery, objectIdSchema } from '../middleware/validation.js';
import { asyncHandler, validateObjectIdParam } from '../middleware/entityLoader.js';
import { AppError } from '../middleware/errorHandler.js';
import { collectMonitoringSnapshot } from '../services/monitoring.js';

/**
 * Service monitoring routes (issue #25), mounted at `/api/monitoring`.
 *
 * Any authenticated user can read the metrics snapshot and the alert rules;
 * creating, updating and deleting rules is admin-only.
 */
const router: RouterType = Router();

const severitySchema = z.enum(ALERT_SEVERITIES);

const metricsQuerySchema = z.object({
  infrastructureId: objectIdSchema.optional(),
  serviceId: objectIdSchema.optional(),
  severity: severitySchema.optional(),
});

const scopeSchema = z.object({
  serviceId: objectIdSchema.optional(),
  infrastructureId: objectIdSchema.optional(),
});

const createAlertRuleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  metric: z.enum(ALERT_METRICS),
  operator: z.enum(ALERT_OPERATORS),
  threshold: z.number().finite().min(0),
  severity: severitySchema,
  scope: scopeSchema.optional(),
  enabled: z.boolean().optional(),
});

const updateAlertRuleSchema = createAlertRuleSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field to update is required',
  });

// GET /api/monitoring/metrics - CPU/memory snapshot of running services + fired alerts
router.get(
  '/metrics',
  authMiddleware,
  validateQuery(metricsQuerySchema),
  asyncHandler(async (req, res) => {
    const filters = req.query as z.infer<typeof metricsQuerySchema>;
    res.json(await collectMonitoringSnapshot(filters));
  })
);

// GET /api/monitoring/alert-rules - List alert rules
router.get(
  '/alert-rules',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const rules = await AlertRule.find().sort({ createdAt: -1 }).select('-__v').lean();
    res.json(rules);
  })
);

// POST /api/monitoring/alert-rules - Create an alert rule (admin)
router.post(
  '/alert-rules',
  authMiddleware,
  requireRole('admin'),
  validateBody(createAlertRuleSchema),
  asyncHandler(async (req, res) => {
    const rule = await AlertRule.create({
      ...(req.body as z.infer<typeof createAlertRuleSchema>),
      createdBy: req.user?.username ?? '',
    });
    res.status(201).json(rule.toJSON());
  })
);

// PUT /api/monitoring/alert-rules/:id - Update an alert rule (admin)
router.put(
  '/alert-rules/:id',
  authMiddleware,
  requireRole('admin'),
  validateObjectIdParam,
  validateBody(updateAlertRuleSchema),
  asyncHandler(async (req, res) => {
    const rule = await AlertRule.findByIdAndUpdate(
      req.params.id,
      { $set: req.body as z.infer<typeof updateAlertRuleSchema> },
      { returnDocument: 'after', runValidators: true }
    )
      .select('-__v')
      .lean();
    if (!rule) throw new AppError('Alert rule not found', 404);
    res.json(rule);
  })
);

// DELETE /api/monitoring/alert-rules/:id - Delete an alert rule (admin)
router.delete(
  '/alert-rules/:id',
  authMiddleware,
  requireRole('admin'),
  validateObjectIdParam,
  asyncHandler(async (req, res) => {
    const rule = await AlertRule.findByIdAndDelete(req.params.id);
    if (!rule) throw new AppError('Alert rule not found', 404);
    res.json({ message: 'Alert rule deleted successfully' });
  })
);

export default router;
