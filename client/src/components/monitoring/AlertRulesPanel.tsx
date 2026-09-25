import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  monitoringApi,
  type AlertMetric,
  type AlertOperator,
  type AlertRule,
  type AlertRuleInput,
  type AlertSeverity,
} from '@/lib/api';
import { ALL, METRIC_LABELS, OPERATOR_LABELS, SEVERITIES } from '@/lib/monitoring-history';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ErrorState } from '@/components/ui/error-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface ServiceOption {
  serviceId: string;
  label: string;
}

interface AlertRulesPanelProps {
  /** Catalog services currently running, offered as rule scopes. */
  serviceOptions: ServiceOption[];
}

export const SEVERITY_BADGE: Record<AlertSeverity, 'danger' | 'warning' | 'secondary'> = {
  critical: 'danger',
  warning: 'warning',
  info: 'secondary',
};

interface RuleForm {
  name: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: string;
  severity: AlertSeverity;
  serviceId: string;
  enabled: boolean;
}

const EMPTY_FORM: RuleForm = {
  name: '',
  metric: 'cpu_millicores',
  operator: 'gt',
  threshold: '',
  severity: 'warning',
  serviceId: ALL,
  enabled: true,
};

function toForm(rule: AlertRule): RuleForm {
  return {
    name: rule.name,
    metric: rule.metric,
    operator: rule.operator,
    threshold: String(rule.threshold),
    severity: rule.severity,
    serviceId: rule.scope?.serviceId ?? ALL,
    enabled: rule.enabled,
  };
}

function errorMessage(error: unknown): string {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 403) return 'Only administrators can manage alert rules';
  const apiError = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return apiError ?? (error instanceof Error ? error.message : 'Request failed');
}

/**
 * Threshold alert rules evaluated against each metrics snapshot. Everyone can
 * read them; only administrators get the create/edit/delete controls (the
 * server enforces the same rule and answers 403 otherwise).
 */
export function AlertRulesPanel({ serviceOptions }: AlertRulesPanelProps) {
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);
  const [deleting, setDeleting] = useState<AlertRule | null>(null);

  const {
    data: rules = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: monitoringApi.listRules,
  });

  const onMutated = (message: string) => {
    queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
    queryClient.invalidateQueries({ queryKey: ['monitoring-metrics'] });
    toast.success(message);
  };

  const saveMutation = useMutation({
    mutationFn: (input: AlertRuleInput) =>
      editing ? monitoringApi.updateRule(editing._id, input) : monitoringApi.createRule(input),
    onSuccess: () => {
      onMutated(editing ? 'Alert rule updated' : 'Alert rule created');
      setDialogOpen(false);
    },
    onError: (error) => toast.error(`Failed to save alert rule: ${errorMessage(error)}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => monitoringApi.deleteRule(id),
    onSuccess: () => onMutated('Alert rule deleted'),
    onError: (error) => toast.error(`Failed to delete alert rule: ${errorMessage(error)}`),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (rule: AlertRule) => {
    setEditing(rule);
    setForm(toForm(rule));
    setDialogOpen(true);
  };

  const threshold = Number(form.threshold);
  const thresholdNegative = form.threshold !== '' && threshold < 0;
  const formValid = form.name.trim() !== '' && form.threshold !== '' && threshold >= 0;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!formValid) return;
    saveMutation.mutate({
      name: form.name.trim(),
      metric: form.metric,
      operator: form.operator,
      threshold,
      severity: form.severity,
      // Keep any infrastructure scope set through the API.
      scope: {
        ...editing?.scope,
        serviceId: form.serviceId === ALL ? undefined : form.serviceId,
      },
      enabled: form.enabled,
    });
  };

  const serviceLabel = (serviceId?: string) =>
    serviceId
      ? (serviceOptions.find((o) => o.serviceId === serviceId)?.label ?? 'One service')
      : 'All services';

  // A scoped rule whose service is not running right now stays selectable.
  const scopeOptions =
    form.serviceId !== ALL && !serviceOptions.some((o) => o.serviceId === form.serviceId)
      ? [...serviceOptions, { serviceId: form.serviceId, label: 'Current service' }]
      : serviceOptions;

  return (
    <div className="rounded-lg border bg-background p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Alert rules</h2>
          <p className="text-sm text-muted-foreground">
            Thresholds checked against every metrics refresh.
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New rule
          </Button>
        )}
      </div>

      {!isAdmin && (
        <p className="mb-4 text-xs text-muted-foreground">
          Read-only: only administrators can manage alert rules.
        </p>
      )}

      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading alert rules…</p>
      ) : error ? (
        <ErrorState error={error as Error} onRetry={() => refetch()} />
      ) : rules.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No alert rules defined</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Applies to</TableHead>
              <TableHead>Status</TableHead>
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule._id}>
                <TableCell className="font-medium">{rule.name}</TableCell>
                <TableCell>
                  {METRIC_LABELS[rule.metric]} {OPERATOR_LABELS[rule.operator]} {rule.threshold}
                </TableCell>
                <TableCell>
                  <Badge variant={SEVERITY_BADGE[rule.severity]} className="capitalize">
                    {rule.severity}
                  </Badge>
                </TableCell>
                <TableCell>{serviceLabel(rule.scope?.serviceId)}</TableCell>
                <TableCell>{rule.enabled ? 'Enabled' : 'Disabled'}</TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${rule.name}`}
                      onClick={() => openEdit(rule)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${rule.name}`}
                      onClick={() => setDeleting(rule)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit alert rule' : 'New alert rule'}</DialogTitle>
            <DialogDescription>
              Fires when a running service&apos;s metric crosses the threshold.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="alert-rule-name">Name</Label>
              <Input
                id="alert-rule-name"
                value={form.name}
                maxLength={100}
                required
                aria-required="true"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="alert-rule-metric">Metric</Label>
                <Select
                  value={form.metric}
                  onValueChange={(v) => setForm({ ...form, metric: v as AlertMetric })}
                >
                  <SelectTrigger id="alert-rule-metric">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(METRIC_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="alert-rule-operator">Operator</Label>
                <Select
                  value={form.operator}
                  onValueChange={(v) => setForm({ ...form, operator: v as AlertOperator })}
                >
                  <SelectTrigger id="alert-rule-operator">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(OPERATOR_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="alert-rule-threshold">Threshold</Label>
                <Input
                  id="alert-rule-threshold"
                  type="number"
                  min={0}
                  step="any"
                  value={form.threshold}
                  required
                  aria-required="true"
                  aria-invalid={thresholdNegative || undefined}
                  aria-describedby={thresholdNegative ? 'alert-rule-threshold-error' : undefined}
                  onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                />
                {thresholdNegative && (
                  <p id="alert-rule-threshold-error" className="text-xs text-destructive">
                    Threshold must be 0 or greater
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="alert-rule-severity">Severity</Label>
                <Select
                  value={form.severity}
                  onValueChange={(v) => setForm({ ...form, severity: v as AlertSeverity })}
                >
                  <SelectTrigger id="alert-rule-severity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((severity) => (
                      <SelectItem key={severity} value={severity} className="capitalize">
                        {severity}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="alert-rule-scope">Applies to</Label>
                <Select
                  value={form.serviceId}
                  onValueChange={(v) => setForm({ ...form, serviceId: v })}
                >
                  <SelectTrigger id="alert-rule-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All services</SelectItem>
                    {scopeOptions.map((option) => (
                      <SelectItem key={option.serviceId} value={option.serviceId}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="alert-rule-enabled"
                checked={form.enabled}
                onCheckedChange={(checked) => setForm({ ...form, enabled: checked === true })}
              />
              <Label htmlFor="alert-rule-enabled">Enabled</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!formValid || saveMutation.isPending}>
                {editing ? 'Save changes' : 'Create rule'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete alert rule"
        description={`Delete the alert rule "${deleting?.name ?? ''}"? This cannot be undone.`}
        confirmText="Delete"
        destructive
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting._id);
          setDeleting(null);
        }}
      />
    </div>
  );
}
