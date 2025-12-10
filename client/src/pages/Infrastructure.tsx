import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2 } from 'lucide-react';
import {
  infrastructuresApi,
  Infrastructure as InfrastructureType,
  CreateInfrastructureData,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InfrastructureTable } from '@/components/infrastructure/InfrastructureTable';
import { InfrastructureForm } from '@/components/infrastructure/InfrastructureForm';
import { toast } from 'sonner';

export function Infrastructure() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInfra, setEditingInfra] = useState<InfrastructureType | null>(null);

  const { data: infrastructures = [], isLoading } = useQuery({
    queryKey: ['infrastructures'],
    queryFn: infrastructuresApi.list,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateInfrastructureData) => infrastructuresApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['infrastructures'] });
      toast.success('Infrastructure created successfully');
      setDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(`Failed to create infrastructure: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateInfrastructureData> }) =>
      infrastructuresApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['infrastructures'] });
      toast.success('Infrastructure updated successfully');
      setDialogOpen(false);
      setEditingInfra(null);
    },
    onError: (error: Error) => {
      toast.error(`Failed to update infrastructure: ${error.message}`);
    },
  });

  const handleSubmit = async (data: CreateInfrastructureData) => {
    if (editingInfra) {
      // For updates, only include credentials if provided
      const updateData: Partial<CreateInfrastructureData> = {
        name: data.name,
        type: data.type,
        endpoint: data.endpoint,
        capacity: data.capacity,
      };
      if (data.credentials) {
        updateData.credentials = data.credentials;
      }
      await updateMutation.mutateAsync({ id: editingInfra._id, data: updateData });
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  const handleEdit = (infra: InfrastructureType) => {
    setEditingInfra(infra);
    setDialogOpen(true);
  };

  const handleOpenDialog = () => {
    setEditingInfra(null);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingInfra(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Infrastructure</h1>
          <p className="text-muted-foreground">Manage Kubernetes clusters and deployment targets</p>
        </div>
        <Button onClick={handleOpenDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Infrastructure
        </Button>
      </div>

      <div className="rounded-lg border bg-background">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <InfrastructureTable infrastructures={infrastructures} onEdit={handleEdit} />
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingInfra ? 'Edit Infrastructure' : 'Add Infrastructure'}</DialogTitle>
            <DialogDescription>
              {editingInfra
                ? 'Update the infrastructure configuration'
                : 'Configure a new deployment target for your scenarios'}
            </DialogDescription>
          </DialogHeader>
          <InfrastructureForm
            infrastructure={editingInfra || undefined}
            onSubmit={handleSubmit}
            onCancel={handleCloseDialog}
            isSubmitting={createMutation.isPending || updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
