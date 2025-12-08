import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, ExternalLink, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { scenariosApi, Execution } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface ExecutionPanelProps {
  scenarioId: string;
  scenarioTitle: string;
  infrastructureName?: string;
  executions: Execution[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-4 w-4 text-yellow-500" />,
  running: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
  completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
};

export function ExecutionPanel({
  scenarioId,
  scenarioTitle,
  infrastructureName,
  executions,
  open,
  onOpenChange,
}: ExecutionPanelProps) {
  const queryClient = useQueryClient();
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null);
  const [conclusionText, setConclusionText] = useState('');

  const executeMutation = useMutation({
    mutationFn: () => scenariosApi.execute(scenarioId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['scenario', scenarioId] });
      toast.success('Execution started');
      // Open MAESTRO in new tab
      if (result.maestroUrl) {
        window.open(result.maestroUrl, '_blank');
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to start execution: ${error.message}`);
    },
  });

  const conclusionMutation = useMutation({
    mutationFn: ({ executionId, text }: { executionId: string; text: string }) =>
      scenariosApi.addConclusion(scenarioId, executionId, { text, author: 'User' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenario', scenarioId] });
      toast.success('Conclusion saved');
      setSelectedExecution(null);
      setConclusionText('');
    },
    onError: (error: Error) => {
      toast.error(`Failed to save conclusion: ${error.message}`);
    },
  });

  const handleExecute = () => {
    executeMutation.mutate();
  };

  const handleSaveConclusion = () => {
    if (selectedExecution && conclusionText.trim()) {
      conclusionMutation.mutate({
        executionId: selectedExecution._id,
        text: conclusionText,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Execute Scenario</DialogTitle>
          <DialogDescription>
            {scenarioTitle} - Target: {infrastructureName || 'Not configured'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Execute Button */}
          <div className="flex items-center gap-4 p-4 border rounded-lg bg-muted/30">
            <div className="flex-1">
              <h3 className="font-medium">Start New Execution</h3>
              <p className="text-sm text-muted-foreground">
                Deploy the scenario to MAESTRO and open the orchestrator interface
              </p>
            </div>
            <Button onClick={handleExecute} disabled={executeMutation.isPending}>
              {executeMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Execute
            </Button>
          </div>

          {/* Execution History */}
          <div>
            <h3 className="font-medium mb-3">Execution History</h3>
            {executions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No executions yet
              </p>
            ) : (
              <div className="space-y-2">
                {executions
                  .slice()
                  .reverse()
                  .map((execution) => (
                    <div
                      key={execution._id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 cursor-pointer"
                      onClick={() => {
                        setSelectedExecution(execution);
                        setConclusionText(execution.conclusion?.text || '');
                      }}
                    >
                      <div className="flex items-center gap-3">
                        {statusIcons[execution.status]}
                        <div>
                          <p className="text-sm font-medium capitalize">{execution.status}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(execution.executedAt).toLocaleString()} by{' '}
                            {execution.executedBy}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {execution.conclusion && (
                          <Badge variant="outline" className="text-xs">
                            Has Conclusion
                          </Badge>
                        )}
                        {execution.maestroSessionId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Open MAESTRO session
                            }}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Conclusion Editor */}
          {selectedExecution && (
            <div className="border-t pt-4">
              <h3 className="font-medium mb-2">
                Conclusion for execution on{' '}
                {new Date(selectedExecution.executedAt).toLocaleString()}
              </h3>
              <Textarea
                value={conclusionText}
                onChange={(e) => setConclusionText(e.target.value)}
                placeholder="Document the results and findings of this execution..."
                rows={4}
                className="mb-3"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelectedExecution(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveConclusion}
                  disabled={!conclusionText.trim() || conclusionMutation.isPending}
                >
                  {conclusionMutation.isPending ? 'Saving...' : 'Save Conclusion'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
