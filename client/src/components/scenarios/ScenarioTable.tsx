import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { MoreHorizontal, Edit, Trash2, Play, FileText } from 'lucide-react';
import { Scenario, scenariosApi } from '@/lib/api';
import { toast } from 'sonner';

interface ScenarioTableProps {
  scenarios: Scenario[];
  projectId: string;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500',
  running: 'bg-blue-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
};

export function ScenarioTable({ scenarios, projectId }: ScenarioTableProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scenarioToDelete, setScenarioToDelete] = useState<Scenario | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => scenariosApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios', projectId] });
      toast.success('Scenario deleted successfully');
      setDeleteDialogOpen(false);
      setScenarioToDelete(null);
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete scenario: ${error.message}`);
    },
  });

  const handleDelete = (scenario: Scenario) => {
    setScenarioToDelete(scenario);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (scenarioToDelete) {
      deleteMutation.mutate(scenarioToDelete._id);
    }
  };

  if (scenarios.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No scenarios yet. Create your first scenario to get started.
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Infrastructure</TableHead>
            <TableHead>Last Execution</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="w-[70px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {scenarios.map((scenario) => (
            <TableRow
              key={scenario._id}
              className="cursor-pointer"
              onClick={() => navigate(`/scenarios/${scenario._id}`)}
            >
              <TableCell>
                <div>
                  <div className="font-medium">{scenario.title}</div>
                  {scenario.description && (
                    <div className="text-sm text-muted-foreground line-clamp-1">
                      {scenario.description}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {scenario.infrastructureId && typeof scenario.infrastructureId === 'object' ? (
                  <div className="flex items-center gap-2">
                    <span>{scenario.infrastructureId.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {scenario.infrastructureId.type}
                    </Badge>
                  </div>
                ) : (
                  <span className="text-muted-foreground">Not assigned</span>
                )}
              </TableCell>
              <TableCell>
                {scenario.latestExecution ? (
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${statusColors[scenario.latestExecution.status]}`}
                    />
                    <span className="capitalize">{scenario.latestExecution.status}</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">Never run</span>
                )}
              </TableCell>
              <TableCell>
                {new Date(scenario.updatedAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/scenarios/${scenario._id}`);
                      }}
                    >
                      <span title="Open Editor">
                        <FileText className="mr-2 h-4 w-4" />
                      </span>
                      Open Editor
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/scenarios/${scenario._id}/edit`);
                      }}
                    >
                      <span title="Edit Details">
                        <Edit className="mr-2 h-4 w-4" />
                      </span>
                      Edit Details
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/scenarios/${scenario._id}?execute=true`);
                      }}
                      disabled={!scenario.infrastructureId}
                    >
                      <span title="Execute">
                        <Play className="mr-2 h-4 w-4" />
                      </span>
                      Execute
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(scenario);
                      }}
                    >
                      <span title="Delete">
                        <Trash2 className="mr-2 h-4 w-4" />
                      </span>
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Scenario</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{scenarioToDelete?.title}&quot;? This will also
              delete all execution history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
