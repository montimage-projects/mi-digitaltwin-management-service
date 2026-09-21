import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Infrastructure } from '@/lib/api';

const infrastructureSchema = z.object({
  name: z.string().min(1, { error: 'Name is required' }).max(100),
  type: z.enum(
    { kubernetes: 'kubernetes', docker: 'docker', virtual: 'virtual' },
    {
      error: 'Please select a valid infrastructure type',
    }
  ),
  endpoint: z
    .string()
    .min(1, { error: 'Endpoint is required' })
    .url({ error: 'Must be a valid URL' }),
  credentials: z.string().min(1, { error: 'Credentials are required' }),
  capacity: z
    .object({
      cpu: z.number().positive().optional(),
      memory: z.number().positive().optional(),
      storage: z.number().positive().optional(),
    })
    .optional(),
});

type InfrastructureFormData = z.infer<typeof infrastructureSchema>;

interface InfrastructureFormProps {
  infrastructure?: Infrastructure;
  onSubmit: (data: InfrastructureFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function InfrastructureForm({
  infrastructure,
  onSubmit,
  onCancel,
  isSubmitting,
}: InfrastructureFormProps) {
  const form = useForm<InfrastructureFormData>({
    resolver: zodResolver(infrastructureSchema),
    defaultValues: {
      name: infrastructure?.name || '',
      type: infrastructure?.type || 'kubernetes',
      endpoint: infrastructure?.endpoint || '',
      credentials: '', // Never pre-fill credentials
      capacity: infrastructure?.capacity || {},
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name *</FormLabel>
              <FormControl>
                <Input placeholder="Enter infrastructure name" {...field} />
              </FormControl>
              <FormDescription>A unique name for this infrastructure</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type *</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select infrastructure type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="kubernetes">Kubernetes</SelectItem>
                  <SelectItem value="docker">Docker</SelectItem>
                  <SelectItem value="virtual">Virtual</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>The type of infrastructure platform</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="endpoint"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Endpoint URL *</FormLabel>
              <FormControl>
                <Input placeholder="https://cluster.example.com:6443" {...field} />
              </FormControl>
              <FormDescription>The API endpoint URL for this infrastructure</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="credentials"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Credentials *</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder={
                    infrastructure ? 'Enter new credentials to update' : 'Enter credentials'
                  }
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {infrastructure
                  ? 'Leave blank to keep existing credentials, or enter new ones to update'
                  : 'API token or kubeconfig content (will be encrypted)'}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? 'Saving...'
              : infrastructure
                ? 'Update Infrastructure'
                : 'Add Infrastructure'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
