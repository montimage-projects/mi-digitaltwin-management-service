import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  getServiceConfigStatus,
  type ServiceConfigInput,
  type ServiceConfigState,
} from '@/lib/service-config-status';

/** Badge colors per configuration state — follows the topology role badge palette. */
const STATE_STYLES: Record<ServiceConfigState, string> = {
  complete: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  incomplete: 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

const STATE_LABELS: Record<ServiceConfigState, string> = {
  complete: 'Configured',
  incomplete: 'Needs configuration',
};

interface ConfigStatusBadgeProps {
  service: ServiceConfigInput;
  className?: string;
}

/**
 * Configuration-completeness badge for a service (issue #245). Icon + text
 * convey the state without relying on color; when incomplete, a tooltip and
 * the accessible label list the missing requirements.
 */
export function ConfigStatusBadge({ service, className }: ConfigStatusBadgeProps) {
  const { state, missing } = getServiceConfigStatus(service);
  const label = STATE_LABELS[state];
  const Icon = state === 'complete' ? CheckCircle2 : AlertTriangle;
  const ariaLabel =
    state === 'complete'
      ? 'Configuration complete'
      : `Needs configuration: missing ${missing.join(', ')}`;

  const badge = (
    <Badge
      variant="outline"
      data-testid={`config-status-badge-${state}`}
      aria-label={ariaLabel}
      className={cn('gap-1 whitespace-nowrap font-medium', STATE_STYLES[state], className)}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </Badge>
  );

  if (state === 'complete') return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex rounded-full">
            {badge}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[250px]">
          <p className="text-xs font-medium">Missing configuration:</p>
          <ul className="list-inside list-disc text-xs">
            {missing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
