import { Badge } from '@/components/ui/badge';

interface AgentStatusBadgeProps {
  status: 'healthy' | 'degraded' | 'offline';
}

const statusClasses: Record<AgentStatusBadgeProps['status'], string> = {
  healthy: 'bg-green-100 text-green-700 border-green-300',
  degraded: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  offline: 'bg-red-100 text-red-700 border-red-300',
};

export function AgentStatusBadge({ status }: AgentStatusBadgeProps) {
  return (
    <Badge variant="outline" className={statusClasses[status]}>
      {status.toUpperCase()}
    </Badge>
  );
}
