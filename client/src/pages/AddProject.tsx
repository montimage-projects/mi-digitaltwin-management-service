import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { projectsApi, type CreateProjectData } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ProjectForm } from '@/components/projects/ProjectForm';

export function AddProject() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate('/projects');
    },
    onError: (err: Error & { response?: { data?: { error?: string } } }) => {
      setError(err.response?.data?.error || err.message || 'Failed to create project');
    },
  });

  const handleSubmit = async (data: CreateProjectData) => {
    setError(null);
    await createMutation.mutateAsync(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/projects')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Add Project</h1>
          <p className="text-muted-foreground">
            Create a new Digital Twin project
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-lg border bg-background p-6">
        <ProjectForm onSubmit={handleSubmit} isSubmitting={createMutation.isPending} />
      </div>
    </div>
  );
}
