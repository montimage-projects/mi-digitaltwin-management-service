import { useState } from 'react';
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
import { MoreHorizontal, Edit, Trash2, RefreshCw, Server, Cloud, Box } from 'lucide-react';
import { Infrastructure, infrastructuresApi } from '@/lib/api';
import { toast } from 'sonner';
import { ErrorState } from '@/components/ui/error-state';

interface InfrastructureTableProps {
  infrastructures: Infrastructure[];
  onEdit: (infra: Infrastructure) => void;
}

const typeIcons: Record<string, React.ReactNode> = {
  kubernetes: <Cloud className="h-4 w-4" />,
  docker: <Box className="h-4 w-4" />,
  virtual: <Server className="h-4 w-4" />,
};

const statusColors: Record<string, string> = {
  active: 'bg-green-500',
  inactive: 'bg-gray-500',
  error: 'bg-red-500',
};

export function InfrastructureTable({ infrastructures, onEdit }: InfrastructureTableProps) {
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [infraToDelete, setInfraToDelete] = useState<Infrastructure | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => infrastructuresApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['infrastructures'] });
      toast.success('Infrastructure deleted successfully');
      setDeleteDialogOpen(false);
      setInfraToDelete(null);
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete infrastructure: ${error.message}`);
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => infrastructuresApi.testConnection(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['infrastructures'] });
      if (result.success) {
        toast.success('Connection successful');
      } else {
        toast.error('Connection failed');
      }
    },
    onError: (error: Error) => {
      toast.error(`Connection test failed: ${error.message}`);
    },
  });

  const handleDelete = (infra: Infrastructure) => {
    setInfraToDelete(infra);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (infraToDelete) {
      deleteMutation.mutate(infraToDelete._id);
    }
  };

  if (infrastructures.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No infrastructures configured. Add your first infrastructure to get started.
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Endpoint</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Health Check</TableHead>
            <TableHead className="w-[70px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {infrastructures.map((infra) => (
            <TableRow key={infra._id}>
              <TableCell>
                <div className="font-medium">{infra.name}</div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {typeIcons[infra.type]}
                  <Badge variant="outline" className="capitalize">
                    {infra.type}
                  </Badge>
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground font-mono">{infra.endpoint}</span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${statusColors[infra.status]}`} />
                  <span className="capitalize">{infra.status}</span>
                </div>
              </TableCell>
              <TableCell>
                {infra.lastHealthCheck ? new Date(infra.lastHealthCheck).toLocaleString() : 'Never'}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => testMutation.mutate(infra._id)}
                      disabled={testMutation.isPending}
                    >
                      <span title="Test Connection">
                        <RefreshCw
                          className={`mr-2 h-4 w-4 ${testMutation.isPending ? 'animate-spin' : ''}`}
                        />
                      </span>
                      Test Connection
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEdit(infra)}>
                      <span title="Edit">
                        <Edit className="mr-2 h-4 w-4" />
                      </span>
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => handleDelete(infra)}
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
            <AlertDialogTitle>Delete Infrastructure</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{infraToDelete?.name}&quot;? This action cannot
              be undone.
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

export function InfrastructureTableWithState({
  infrastructures,
  onEdit,
  error,
  onRetry,
}: {
  infrastructures: Infrastructure[];
  onEdit: (infra: Infrastructure) => void;
  error: Error | string | null;
  onRetry?: () => void;
}) {
  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }
  return <InfrastructureTable infrastructures={infrastructures} onEdit={onEdit} />;
}
