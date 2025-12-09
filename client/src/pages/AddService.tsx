import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { servicesApi, type CreateServiceData } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ServiceForm } from '@/components/services/ServiceForm';

export function AddService() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const tableParam = searchParams.get('table');
  const defaultTable = tableParam === 'OTHER_SERVICES' ? 'OTHER_SERVICES' : 'INTACT_TOOLBOX';
  const isToolbox = defaultTable === 'INTACT_TOOLBOX';

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
          <h1 className="text-2xl font-bold">
            {isToolbox ? 'Add Security Tool' : 'Add Infrastructure Service'}
          </h1>
          <p className="text-muted-foreground">
            {isToolbox
              ? 'Register a new security tool in the INTACT Toolbox'
              : 'Register a new service in Critical Infrastructure'}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-lg border bg-background p-6">
        <ServiceForm
          onSubmit={handleSubmit}
          isSubmitting={createMutation.isPending}
          defaultTable={defaultTable}
        />
      </div>
    </div>
  );
}
