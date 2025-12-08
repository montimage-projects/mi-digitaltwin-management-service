import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { scenariosApi, projectsApi, CreateScenarioData } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ScenarioForm } from '@/components/scenarios/ScenarioForm';
import { toast } from 'sonner';

export function AddScenario() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId!),
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateScenarioData) => scenariosApi.create(projectId!, data),
    onSuccess: (scenario) => {
      queryClient.invalidateQueries({ queryKey: ['scenarios', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success('Scenario created successfully');
      navigate(`/scenarios/${scenario._id}`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to create scenario: ${error.message}`);
    },
  });

  const handleSubmit = async (data: CreateScenarioData) => {
    await createMutation.mutateAsync(data);
  };

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Project not found</p>
        <Button variant="link" onClick={() => navigate('/projects')}>
          Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/projects/${projectId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Add Scenario</h1>
          <p className="text-muted-foreground">
            Project: {project.shortName} - {project.title}
          </p>
        </div>
      </div>

      <div className="max-w-2xl">
        <div className="rounded-lg border bg-background p-6">
          <ScenarioForm onSubmit={handleSubmit} isSubmitting={createMutation.isPending} />
        </div>
      </div>
    </div>
  );
}
