import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { projectsApi, servicesApi, type Project, type CreateProjectData } from '@/lib/api';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { X, Star, AlertCircle } from 'lucide-react';
import { useState, useMemo } from 'react';

const CONSORTIUM_PARTNERS = [
  'ICP',
  'THALES',
  'AIRBUS',
  'SIEMENS',
  'AVL',
  'FRAUNHOFER',
  'SBA',
  'NCSRD',
  'HMU',
  'TUC',
  'MONT',
  'UBI',
  'AXON',
  'K3Y',
  'BEYOND',
  'AEGIS',
  '5YPE',
  'D4P',
  'ULANCS',
];

// Project sectors and their mapping to NIS2 sector slugs
const PROJECT_SECTORS = [
  'Telecommunications',
  'Healthcare',
  'Transportation',
  'Nuclear',
  'Cross-Sector',
] as const;

// Maps project sectors to NIS2 sector slugs
// A project sector is available if ANY of its mapped NIS2 sectors have services
const PROJECT_SECTOR_TO_NIS2: Record<string, string[]> = {
  Telecommunications: [
    'digital-infrastructure', // 5G core, RAN, network simulation, attack emulation
    'ict-service-management-b2b', // Monitoring, virtualization, security/testing tools
    'digital-providers', // User interfaces
    'research', // Training & simulation
  ],
  Healthcare: ['health'],
  Transportation: ['transport'],
  Nuclear: ['energy'],
  'Cross-Sector': [], // Always available
};

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
  // Track manually selected partners separately from auto-selected ones
  const [manualPartners, setManualPartners] = useState<string[]>(() => {
    // On edit, existing partners that aren't auto-selected become manual
    return project?.involvedPartners || [];
  });
  const [selectedAtomicProjects, setSelectedAtomicProjects] = useState<string[]>(
    project?.atomicProjectIds?.map((p) => p._id) || []
  );

  // Fetch existing projects for composite selection
  const { data: allProjects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  });

  // Fetch Critical Infrastructure Services for sector filtering and provider auto-selection
  const { data: infrastructureData } = useQuery({
    queryKey: ['services', 'OTHER_SERVICES'],
    queryFn: () => servicesApi.list({ table: 'OTHER_SERVICES', limit: 200 }),
  });

  const infrastructureServices = infrastructureData?.services || [];

  // Filter to only atomic (non-composite) projects, excluding current project
  const atomicProjects = allProjects.filter((p) => !p.isComposite && p._id !== project?._id);

  // Compute available sectors based on services that have NIS2 sectors assigned
  const { availableSectors, sectorServiceCount } = useMemo(() => {
    const servicesWithSector = infrastructureServices.filter((s) => s.sectorId);
    const nis2SectorSlugs = new Set(servicesWithSector.map((s) => s.sectorId!.slug));

    const counts: Record<string, number> = {};
    PROJECT_SECTORS.forEach((sector) => {
      if (sector === 'Cross-Sector') {
        counts[sector] = servicesWithSector.length;
      } else {
        const requiredNIS2 = PROJECT_SECTOR_TO_NIS2[sector] || [];
        counts[sector] = servicesWithSector.filter((s) =>
          requiredNIS2.includes(s.sectorId!.slug)
        ).length;
      }
    });

    const available = PROJECT_SECTORS.filter((sector) => {
      if (sector === 'Cross-Sector') return true;
      const requiredNIS2 = PROJECT_SECTOR_TO_NIS2[sector] || [];
      return requiredNIS2.some((slug) => nis2SectorSlugs.has(slug));
    });

    return { availableSectors: available, sectorServiceCount: counts };
  }, [infrastructureServices]);

  // Extract unique providers from infrastructure services (no auto-selection)
  // Providers are available for manual selection but not auto-added
  const serviceProviders = useMemo(() => {
    const providers = infrastructureServices
      .map((s) => s.provider)
      .filter((p): p is string => Boolean(p) && p.trim() !== '');
    return [...new Set(providers)].sort();
  }, [infrastructureServices]);

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
  const leader = watch('leader');
  const shortName = watch('shortName');

  // Check for duplicate short name in real-time
  const isDuplicateShortName = useMemo(() => {
    if (!shortName?.trim()) return false;
    const normalizedInput = shortName.trim().toUpperCase();
    return allProjects.some(
      (p) => p.shortName.toUpperCase() === normalizedInput && p._id !== project?._id
    );
  }, [shortName, allProjects, project?._id]);

  // Cross-Sector automatically makes it composite
  if (sector === 'Cross-Sector' && !isComposite) {
    setValue('isComposite', true);
  }

  // Compute combined partners list (leader + manual selections)
  const involvedPartners = useMemo(() => {
    const partners = new Set<string>();

    // Leader is always included
    if (leader) partners.add(leader);

    // Add manual selections
    manualPartners.forEach((p) => partners.add(p));

    return [...partners];
  }, [leader, manualPartners]);

  // Helper to determine partner state
  const getPartnerState = (partner: string): 'leader' | 'manual' => {
    if (partner === leader) return 'leader';
    return 'manual';
  };

  // All unique partners (consortium + providers)
  const allPartnerOptions = useMemo(() => {
    const all = new Set([...CONSORTIUM_PARTNERS, ...serviceProviders]);
    return [...all].sort();
  }, [serviceProviders]);

  const handleFormSubmit = (data: ProjectFormValues) => {
    const projectData: CreateProjectData = {
      ...data,
      involvedPartners,
      atomicProjectIds: data.isComposite ? selectedAtomicProjects : [],
    };
    onSubmit(projectData);
  };

  const togglePartner = (partner: string) => {
    const state = getPartnerState(partner);
    // Cannot toggle leader (auto-selected)
    if (state === 'leader') return;

    setManualPartners((prev) =>
      prev.includes(partner) ? prev.filter((p) => p !== partner) : [...prev, partner]
    );
  };

  const toggleAtomicProject = (projectId: string) => {
    setSelectedAtomicProjects((prev) =>
      prev.includes(projectId) ? prev.filter((p) => p !== projectId) : [...prev, projectId]
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
            className={`uppercase ${isDuplicateShortName ? 'border-destructive focus-visible:ring-destructive' : ''}`}
          />
          {errors.shortName && (
            <p className="text-sm text-destructive">{errors.shortName.message}</p>
          )}
          {isDuplicateShortName && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Project with this short name already exists
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="leader">Leader *</Label>
          <Select value={watch('leader')} onValueChange={(value) => setValue('leader', value)}>
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
          {errors.leader && <p className="text-sm text-destructive">{errors.leader.message}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          {...register('title')}
          placeholder="e.g., Telecommunications Pilot Use Case"
        />
        {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
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
              {PROJECT_SECTORS.map((sectorOption) => {
                const isAvailable = availableSectors.includes(sectorOption);
                const count = sectorServiceCount[sectorOption] || 0;
                return (
                  <SelectItem
                    key={sectorOption}
                    value={sectorOption}
                    disabled={!isAvailable && sectorOption !== 'Cross-Sector'}
                  >
                    <span className="flex items-center gap-2">
                      {sectorOption}
                      {sectorOption !== 'Cross-Sector' && (
                        <span className="text-xs text-muted-foreground">
                          ({count} {count === 1 ? 'service' : 'services'})
                        </span>
                      )}
                      {!isAvailable && sectorOption !== 'Cross-Sector' && (
                        <span className="text-xs text-amber-600">(no services)</span>
                      )}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {infrastructureServices.length === 0 && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              No infrastructure services available. Sector filtering disabled.
            </p>
          )}
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
        <p className="text-xs text-muted-foreground">
          Leader is automatically included. Click to add or remove partners.
        </p>
        <TooltipProvider>
          <div className="flex flex-wrap gap-2 rounded-md border p-3">
            {allPartnerOptions.map((partner) => {
              const isSelected = involvedPartners.includes(partner);
              const state = getPartnerState(partner);
              const isLeader = state === 'leader';

              // Determine badge variant and style
              const variant: 'default' | 'outline' = isSelected ? 'default' : 'outline';

              const tooltipContent = isLeader
                ? 'Project leader - automatically included'
                : isSelected
                  ? 'Click to remove'
                  : 'Click to add';

              return (
                <Tooltip key={partner}>
                  <TooltipTrigger asChild>
                    <Badge
                      variant={variant}
                      className={`cursor-pointer transition-colors ${
                        isLeader && isSelected ? 'cursor-default' : ''
                      } ${!isSelected ? 'opacity-60 hover:opacity-100' : ''}`}
                      onClick={() => togglePartner(partner)}
                    >
                      {isLeader && isSelected && <Star className="mr-1 h-3 w-3 fill-current" />}
                      {partner}
                      {isSelected && !isLeader && <X className="ml-1 h-3 w-3" />}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{tooltipContent}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
        <p className="text-xs text-muted-foreground">
          Selected: {involvedPartners.length} partner{involvedPartners.length !== 1 ? 's' : ''}
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
        <Button type="submit" disabled={isSubmitting || isDuplicateShortName}>
          {isSubmitting ? 'Saving...' : project ? 'Update Project' : 'Create Project'}
        </Button>
      </div>
    </form>
  );
}
