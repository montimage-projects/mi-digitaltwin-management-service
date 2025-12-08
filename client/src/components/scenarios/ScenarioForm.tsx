import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { Scenario, infrastructuresApi } from '@/lib/api';

const scenarioSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional(),
  infrastructureId: z.string().optional(),
});

type ScenarioFormData = z.infer<typeof scenarioSchema>;

interface ScenarioFormProps {
  scenario?: Scenario;
  onSubmit: (data: ScenarioFormData) => Promise<void>;
  isSubmitting: boolean;
}

export function ScenarioForm({ scenario, onSubmit, isSubmitting }: ScenarioFormProps) {
  const { data: infrastructures = [] } = useQuery({
    queryKey: ['infrastructures'],
    queryFn: infrastructuresApi.list,
  });

  const getInfrastructureId = (): string => {
    if (!scenario?.infrastructureId) return '';
    if (typeof scenario.infrastructureId === 'object') {
      return scenario.infrastructureId._id;
    }
    return '';
  };

  const form = useForm<ScenarioFormData>({
    resolver: zodResolver(scenarioSchema),
    defaultValues: {
      title: scenario?.title || '',
      description: scenario?.description || '',
      infrastructureId: getInfrastructureId(),
    },
  });

  const handleSubmit = async (data: ScenarioFormData) => {
    // Clean up empty infrastructureId
    const cleanedData = {
      ...data,
      infrastructureId: data.infrastructureId || undefined,
    };
    await onSubmit(cleanedData);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title *</FormLabel>
              <FormControl>
                <Input placeholder="Enter scenario title" {...field} />
              </FormControl>
              <FormDescription>A descriptive title for this scenario</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe the purpose and goals of this scenario"
                  rows={4}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="infrastructureId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Target Infrastructure</FormLabel>
              <Select
                onValueChange={(value) => field.onChange(value === 'none' ? '' : value)}
                defaultValue={field.value || 'none'}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an infrastructure (optional)" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {infrastructures.map((infra) => (
                    <SelectItem key={infra._id} value={infra._id}>
                      <div className="flex items-center gap-2">
                        <span>{infra.name}</span>
                        <span className="text-muted-foreground text-xs">({infra.type})</span>
                        {infra.status === 'active' && (
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                The infrastructure where this scenario will be deployed
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : scenario ? 'Update Scenario' : 'Create Scenario'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
