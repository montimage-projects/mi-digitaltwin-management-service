import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { scenariosApi, CreateScenarioData } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ScenarioForm } from '@/components/scenarios/ScenarioForm';
import { toast } from 'sonner';

export function EditScenario() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: scenario, isLoading } = useQuery({
    queryKey: ['scenario', id],
    queryFn: () => scenariosApi.get(id!),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<CreateScenarioData>) => scenariosApi.update(id!, data),
    onSuccess: () => {
      const projectId =
        scenario?.projectId && typeof scenario.projectId === 'object'
          ? scenario.projectId._id
          : scenario?.projectId;
      queryClient.invalidateQueries({ queryKey: ['scenario', id] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['scenarios', projectId] });
      }
      toast.success('Scenario updated successfully');
      navigate(`/scenarios/${id}`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to update scenario: ${error.message}`);
    },
  });

  const handleSubmit = async (data: Partial<CreateScenarioData>) => {
    await updateMutation.mutateAsync(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!scenario) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Scenario not found</p>
        <Button variant="link" onClick={() => navigate('/projects')}>
          Back to Projects
        </Button>
      </div>
    );
  }

  const projectId =
    scenario.projectId && typeof scenario.projectId === 'object'
      ? scenario.projectId._id
      : scenario.projectId;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/scenarios/${id}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Edit Scenario</h1>
          <p className="text-muted-foreground">{scenario.title}</p>
        </div>
      </div>

      <div className="max-w-2xl">
        <div className="rounded-lg border bg-background p-6">
          <ScenarioForm
            scenario={scenario}
            onSubmit={handleSubmit}
            isSubmitting={updateMutation.isPending}
          />
        </div>

        <div className="mt-4">
          <Button variant="link" onClick={() => navigate(`/projects/${projectId}`)}>
            Back to Project
          </Button>
        </div>
      </div>
    </div>
  );
}
