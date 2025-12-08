import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { projectsApi, type Project, type CreateProjectData } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { useState } from 'react';

const CONSORTIUM_PARTNERS = [
  'ICP', 'THALES', 'AIRBUS', 'SIEMENS', 'AVL', 'FRAUNHOFER', 'SBA', 'NCSRD',
  'HMU', 'TUC', 'MONT', 'UBI', 'AXON', 'K3Y', 'BEYOND', 'AEGIS', '5YPE', 'D4P', 'ULANCS'
];

const projectFormSchema = z.object({
  shortName: z.string().min(1, 'Short name is required').max(50),
  title: z.string().min(1, 'Title is required').max(200),
  sector: z.enum(['Telecommunications', 'Healthcare', 'Transportation', 'Nuclear', 'Cross-Sector']),
  leader: z.string().min(1, 'Leader is required').max(100),
  description: z.string().max(2000).optional().or(z.literal('')),
  isComposite: z.boolean(),
});

type ProjectFormValues = z.infer<typeof projectFormSchema>;

interface ProjectFormProps {
  project?: Project;
  onSubmit: (data: CreateProjectData) => Promise<void>;
  isSubmitting?: boolean;
}

export function ProjectForm({ project, onSubmit, isSubmitting }: ProjectFormProps) {
  const [involvedPartners, setInvolvedPartners] = useState<string[]>(project?.involvedPartners || []);
  const [selectedAtomicProjects, setSelectedAtomicProjects] = useState<string[]>(
    project?.atomicProjectIds?.map(p => p._id) || []
  );

  // Fetch existing projects for composite selection
  const { data: allProjects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  });

  // Filter to only atomic (non-composite) projects, excluding current project
  const atomicProjects = allProjects.filter(
    p => !p.isComposite && p._id !== project?._id
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      shortName: project?.shortName || '',
      title: project?.title || '',
      sector: project?.sector || 'Telecommunications',
      leader: project?.leader || '',
      description: project?.description || '',
      isComposite: project?.isComposite || false,
    },
  });

  const isComposite = watch('isComposite');
  const sector = watch('sector');

  // Cross-Sector automatically makes it composite
  if (sector === 'Cross-Sector' && !isComposite) {
    setValue('isComposite', true);
  }

  const handleFormSubmit = (data: ProjectFormValues) => {
    const projectData: CreateProjectData = {
      ...data,
      involvedPartners,
      atomicProjectIds: data.isComposite ? selectedAtomicProjects : [],
    };
    onSubmit(projectData);
  };

  const togglePartner = (partner: string) => {
    setInvolvedPartners(prev =>
      prev.includes(partner)
        ? prev.filter(p => p !== partner)
        : [...prev, partner]
    );
  };

  const toggleAtomicProject = (projectId: string) => {
    setSelectedAtomicProjects(prev =>
      prev.includes(projectId)
        ? prev.filter(p => p !== projectId)
        : [...prev, projectId]
    );
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="shortName">Short Name *</Label>
          <Input
            id="shortName"
            {...register('shortName')}
            placeholder="e.g., PUC1-TELCO"
            className="uppercase"
          />
          {errors.shortName && (
            <p className="text-sm text-destructive">{errors.shortName.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="leader">Leader *</Label>
          <Select
            value={watch('leader')}
            onValueChange={(value) => setValue('leader', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select leader" />
            </SelectTrigger>
            <SelectContent>
              {CONSORTIUM_PARTNERS.map((partner) => (
                <SelectItem key={partner} value={partner}>
                  {partner}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.leader && (
            <p className="text-sm text-destructive">{errors.leader.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          {...register('title')}
          placeholder="e.g., Telecommunications Pilot Use Case"
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sector">Sector *</Label>
          <Select
            value={watch('sector')}
            onValueChange={(value) => setValue('sector', value as ProjectFormValues['sector'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Telecommunications">Telecommunications</SelectItem>
              <SelectItem value="Healthcare">Healthcare</SelectItem>
              <SelectItem value="Transportation">Transportation</SelectItem>
              <SelectItem value="Nuclear">Nuclear</SelectItem>
              <SelectItem value="Cross-Sector">Cross-Sector</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 flex items-end">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              {...register('isComposite')}
              disabled={sector === 'Cross-Sector'}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm">Composite Project (Cross-Sector Digital Twin)</span>
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          {...register('description')}
          placeholder="Describe the project..."
          rows={3}
        />
      </div>

      {/* Involved Partners */}
      <div className="space-y-2">
        <Label>Involved Partners</Label>
        <div className="flex flex-wrap gap-2 rounded-md border p-3">
          {CONSORTIUM_PARTNERS.map((partner) => (
            <Badge
              key={partner}
              variant={involvedPartners.includes(partner) ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => togglePartner(partner)}
            >
              {partner}
              {involvedPartners.includes(partner) && (
                <X className="ml-1 h-3 w-3" />
              )}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Click to select/deselect partners. Selected: {involvedPartners.length}
        </p>
      </div>

      {/* Atomic Projects (for composite) */}
      {isComposite && atomicProjects.length > 0 && (
        <div className="space-y-2">
          <Label>Compose from Atomic Projects</Label>
          <div className="space-y-2 rounded-md border p-3">
            {atomicProjects.map((p) => (
              <label
                key={p._id}
                className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
              >
                <input
                  type="checkbox"
                  checked={selectedAtomicProjects.includes(p._id)}
                  onChange={() => toggleAtomicProject(p._id)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="font-mono text-sm">{p.shortName}</span>
                <span className="text-sm text-muted-foreground">- {p.title}</span>
                <Badge variant="outline" className="ml-auto text-xs">
                  {p.sector}
                </Badge>
              </label>
            ))}
          </div>
          {selectedAtomicProjects.length < 2 && sector === 'Cross-Sector' && (
            <p className="text-xs text-amber-600">
              Cross-sector projects should compose at least 2 atomic projects
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : project ? 'Update Project' : 'Create Project'}
        </Button>
      </div>
    </form>
  );
}
