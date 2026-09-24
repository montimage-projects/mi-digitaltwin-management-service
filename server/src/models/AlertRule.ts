import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Threshold alert rule for the service monitoring dashboard (issue #25).
 *
 * A rule compares one metric of every running service it applies to against a
 * threshold; the monitoring service evaluates enabled rules on each metrics
 * snapshot and reports the ones that fire, tagged with the rule's severity.
 * A rule applies to all services unless `scope` narrows it to one catalog
 * service and/or one infrastructure.
 */

export const ALERT_METRICS = ['cpu_millicores', 'memory_mib'] as const;
export const ALERT_OPERATORS = ['gt', 'gte', 'lt', 'lte'] as const;
export const ALERT_SEVERITIES = ['info', 'warning', 'critical'] as const;

export type AlertMetric = (typeof ALERT_METRICS)[number];
export type AlertOperator = (typeof ALERT_OPERATORS)[number];
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export interface IAlertRuleScope {
  serviceId?: Types.ObjectId;
  infrastructureId?: Types.ObjectId;
}

export interface IAlertRule extends Document {
  name: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  severity: AlertSeverity;
  scope?: IAlertRuleScope;
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const scopeSchema = new Schema<IAlertRuleScope>(
  {
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service' },
    infrastructureId: { type: Schema.Types.ObjectId, ref: 'Infrastructure' },
  },
  { _id: false }
);

const alertRuleSchema = new Schema<IAlertRule>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    metric: { type: String, enum: ALERT_METRICS, required: true },
    operator: { type: String, enum: ALERT_OPERATORS, required: true },
    threshold: { type: Number, required: true, min: 0 },
    severity: { type: String, enum: ALERT_SEVERITIES, required: true },
    scope: { type: scopeSchema, default: {} },
    enabled: { type: Boolean, default: true },
    createdBy: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

// The snapshot evaluation loads the enabled rules.
alertRuleSchema.index({ enabled: 1, metric: 1 });

// Remove __v from JSON output
alertRuleSchema.set('toJSON', {
  transform: function (_doc, ret) {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.__v;
    return obj;
  },
});

export const AlertRule = mongoose.model<IAlertRule>('AlertRule', alertRuleSchema);
