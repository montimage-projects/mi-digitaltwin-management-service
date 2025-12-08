import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { servicesApi, type CreateServiceData } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ServiceForm } from '@/components/services/ServiceForm';

export function AddService() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: servicesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      navigate('/services');
    },
    onError: (err: Error & { response?: { data?: { error?: string } } }) => {
      setError(err.response?.data?.error || err.message || 'Failed to create service');
    },
  });

  const handleSubmit = async (data: CreateServiceData) => {
    setError(null);
    await createMutation.mutateAsync(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/services')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Add Service</h1>
          <p className="text-muted-foreground">
            Register a new cybersecurity service in the repository
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-lg border bg-background p-6">
        <ServiceForm onSubmit={handleSubmit} isSubmitting={createMutation.isPending} />
      </div>
    </div>
  );
}
