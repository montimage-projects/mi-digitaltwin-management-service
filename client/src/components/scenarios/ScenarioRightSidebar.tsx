import { Server } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface RightSidebarProps {
  infrastructure: Record<string, unknown> | null;
  selectedInfrastructure: string | null;
  infrastructuresData: Array<{ _id: string; name?: string; type?: string; status?: string }>;
  description?: string;
  executions: Array<{ _id: string; status: string; executedAt: string }>;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500',
  running: 'bg-blue-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
};

export function RightSidebar({
  infrastructure,
  selectedInfrastructure,
  infrastructuresData,
  description,
  executions,
}: RightSidebarProps) {
  const infraName =
    selectedInfrastructure && typeof selectedInfrastructure === 'string'
      ? infrastructuresData.find((i) => i._id === selectedInfrastructure)?.name
      : (infrastructure as { name?: string } | null)?.name;

  const infraType = (infrastructure as { type?: string } | null)?.type;
  const infraStatus = (infrastructure as { status?: string } | null)?.status;

  return (
    <div className="space-y-4 overflow-y-auto h-full w-72">
      {/* Infrastructure */}
      <div className="rounded-lg border bg-background p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Server className="h-4 w-4" />
          Infrastructure
        </h3>
        {infrastructure ? (
          <div className="space-y-2">
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="font-medium">{infraName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Type</p>
              <Badge variant="outline">{infraType}</Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    infraStatus === 'active'
                      ? 'bg-green-500'
                      : infraStatus === 'error'
                        ? 'bg-red-500'
                        : 'bg-gray-500'
                  }`}
                />
                <span className="capitalize">{infraStatus}</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No infrastructure assigned</p>
        )}
      </div>

      {/* Description */}
      {description && (
        <div className="rounded-lg border bg-background p-4">
          <h3 className="font-semibold mb-2">Description</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      )}

      {/* Executions */}
      <div className="rounded-lg border bg-background p-4">
        <h3 className="font-semibold mb-3">Execution History</h3>
        {executions.length > 0 ? (
          <div className="space-y-2">
            {executions
              .slice(-5)
              .reverse()
              .map((execution) => (
                <div
                  key={execution._id}
                  className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${statusColors[execution.status]}`} />
                    <span className="capitalize">{execution.status}</span>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {new Date(execution.executedAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No executions yet</p>
        )}
      </div>

      {/* Timestamps */}
      <div className="rounded-lg border bg-background p-4">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Created</span>
            <span>{new Date(executions[0]?.executedAt ?? '').toLocaleDateString()}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Updated</span>
            <span>{new Date(executions[0]?.executedAt ?? '').toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
