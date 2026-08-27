import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import {
  categoriesApi,
  sectorsApi,
  servicesApi,
  type Service,
  type CreateServiceData,
} from '@/lib/api';
import { MAX_LIST_LIMIT } from '@/lib/constants';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Globe, Terminal, Monitor, ChevronsUpDown, Search, Plus, X } from 'lucide-react';
import { useServiceForm } from '@/hooks/useServiceForm';
import { StandardsEditor } from './StandardsEditor';
import { VersionsEditor, type VersionItem } from './VersionsEditor';
import { InteractsWithEditor } from './InteractsWithEditor';
import { TrlSection, type TrlLevel } from './TrlSection';
import { useServicePayload } from '@/hooks/useServicePayload';

const serviceFormSchema = z.object({
  shortName: z.string().min(1, 'Short name is required').max(50),
  title: z.string().min(1, 'Title is required').max(200),
  categoryId: z.string().min(1, 'Category is required'),
  sectorId: z.string().optional(),
  provider: z.string().min(1, 'Provider is required').max(100),
  description: z.string().max(2000).optional(),
  type: z.enum(['Software', 'Hardware', 'Software/Hardware']),
  uiType: z.enum(['web', 'terminal', 'both']),
  trlCurrent: z.number().min(1).max(9).optional(),
  trlExpected: z.number().min(1).max(9).optional(),
  license: z.string().max(100).optional(),
  repositoryTable: z.enum(['INTACT_TOOLBOX', 'OTHER_SERVICES']),
  currentVersion: z.string().max(50).optional(),
});

type ServiceFormValues = z.infer<typeof serviceFormSchema>;

// Technology Readiness Levels (TRL) definitions
export const TRL_LEVELS: TrlLevel[] = [
  {
    level: 1,
    name: 'Basic Principles',
    description: 'Basic principles observed and reported. Scientific research begins.',
  },
  {
    level: 2,
    name: 'Concept Formulated',
    description:
      'Technology concept and/or application formulated. Practical applications identified.',
  },
  {
    level: 3,
    name: 'Proof of Concept',
    description:
      'Analytical and experimental critical function proof of concept. Active R&D initiated.',
  },
  {
    level: 4,
    name: 'Lab Validation',
    description: 'Component and/or breadboard validation in laboratory environment.',
  },
  {
    level: 5,
    name: 'Lab Scale Prototype',
    description: 'Component and/or breadboard validation in relevant environment.',
  },
  {
    level: 6,
    name: 'Prototype Demo',
    description: 'System/subsystem model or prototype demonstration in relevant environment.',
  },
  {
    level: 7,
    name: 'System Prototype',
    description: 'System prototype demonstration in operational environment.',
  },
  {
    level: 8,
    name: 'System Complete',
    description: 'Actual system completed and qualified through test and demonstration.',
  },
  {
    level: 9,
    name: 'Production Ready',
    description:
      'Actual system proven through successful mission operations. Ready for deployment.',
  },
];

interface ServiceFormProps {
  service?: Service;
  onSubmit: (data: CreateServiceData) => Promise<void>;
  isSubmitting?: boolean;
  defaultTable?: 'INTACT_TOOLBOX' | 'OTHER_SERVICES';
}

export function ServiceForm({ service, onSubmit, isSubmitting, defaultTable }: ServiceFormProps) {
  const formState = useServiceForm({ service });
  const { setOnSubmit, assemblePayload } = useServicePayload();

  // Register the onSubmit callback with the payload hook
  setOnSubmit(onSubmit);

  const [inputName, setInputName] = useState('');
  const [inputDesc, setInputDesc] = useState('');
  const [outputName, setOutputName] = useState('');
  const [outputDesc, setOutputDesc] = useState('');
  const {
    standards,
    licenseSearch,
    customLicenseInput,
    isLicensePopoverOpen,
    setLicenseSearch,
    setCustomLicenseInput,
    setIsLicensePopoverOpen,
    isProviderPopoverOpen,
    setIsProviderPopoverOpen,
    interactsWith,
    useCases,
    useCaseInput,
    setUseCaseInput,
    inputs,
    outputs,
    versions,
    addTag,
    removeTag,
    addInputOutput,
    removeInputOutput,
  } = formState;

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesApi.list,
  });

  const { data: sectors = [] } = useQuery({
    queryKey: ['sectors'],
    queryFn: sectorsApi.list,
  });

  // Fetch all services for "Interacts With" dropdown
  const { data: allServicesData } = useQuery({
    queryKey: ['services', 'all'],
    queryFn: () => servicesApi.list({ limit: MAX_LIST_LIMIT }),
  });
  const allServices = allServicesData?.services || [];

  // Extract unique providers from existing services
  const existingProviders = [...new Set(allServices.map((s) => s.provider).filter(Boolean))].sort();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: {
      shortName: service?.shortName || '',
      title: service?.title || '',
      categoryId: service?.categoryId?._id || '',
      sectorId: service?.sectorId?._id || '',
      provider: service?.provider || '',
      description: service?.description || '',
      type: service?.type || 'Software',
      uiType: service?.uiType || 'web',
      trlCurrent: service?.trl?.current || 5,
      trlExpected: service?.trl?.expected || 7,
      license: service?.license || '',
      repositoryTable: service?.repositoryTable || defaultTable || 'INTACT_TOOLBOX',
      currentVersion: service?.currentVersion || '',
    },
  });

  const trlCurrent = watch('trlCurrent');
  const trlExpected = watch('trlExpected');
  const repositoryTable = watch('repositoryTable');

  const handleFormSubmit = (data: ServiceFormValues) => {
    assemblePayload({
      shortName: data.shortName,
      title: data.title,
      categoryId: data.categoryId,
      sectorId: data.sectorId || undefined,
      provider: data.provider,
      description: data.description,
      type: data.type,
      uiType: data.uiType,
      trlCurrent: data.trlCurrent,
      trlExpected: data.trlExpected,
      license: data.license,
      repositoryTable: data.repositoryTable,
      currentVersion: data.currentVersion,
      standards,
      inputs,
      outputs,
      interactsWith,
      potentialUseCases: useCases,
      versions,
    });
  };

  const handleVersionsChange = (newVersions: VersionItem[]) => {
    formState.setVersions(newVersions);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div>
            <Label htmlFor="shortName">Short Name *</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Unique identifier or acronym for the service
            </p>
          </div>
          <Input
            id="shortName"
            {...register('shortName')}
            placeholder="e.g., MMT"
            className="uppercase"
          />
          {errors.shortName && (
            <p className="text-sm text-destructive">{errors.shortName.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <div>
            <Label htmlFor="provider">Provider *</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Organization or company that provides this service
            </p>
          </div>
          <div className="relative">
            <Input
              id="provider"
              value={watch('provider') || ''}
              onChange={(e) => {
                setValue('provider', e.target.value);
                setIsProviderPopoverOpen(true);
              }}
              onFocus={() => setIsProviderPopoverOpen(true)}
              onBlur={(e) => {
                setTimeout(() => {
                  if (!e.relatedTarget?.closest('[data-provider-list]')) {
                    setIsProviderPopoverOpen(false);
                  }
                }, 150);
              }}
              placeholder="e.g., MONT"
              autoComplete="off"
            />
            {isProviderPopoverOpen && (
              <div
                data-provider-list
                className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-md shadow-md"
              >
                <ScrollArea className="max-h-48">
                  <div className="p-1">
                    {(() => {
                      const currentValue = watch('provider') || '';
                      const filteredProviders = existingProviders.filter((p) =>
                        p.toLowerCase().includes(currentValue.toLowerCase())
                      );

                      if (filteredProviders.length === 0) {
                        if (currentValue.trim()) {
                          return (
                            <div className="p-2 text-xs text-muted-foreground">
                              Using custom provider: "{currentValue}"
                            </div>
                          );
                        }
                        return (
                          <div className="p-2 text-xs text-muted-foreground">
                            No existing providers. Type to add a new one.
                          </div>
                        );
                      }

                      return filteredProviders.map((provider) => (
                        <div
                          key={provider}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-pointer hover:bg-accent ${
                            currentValue === provider ? 'bg-accent' : ''
                          }`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setValue('provider', provider);
                            setIsProviderPopoverOpen(false);
                          }}
                        >
                          {provider}
                        </div>
                      ));
                    })()}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
          {errors.provider && <p className="text-sm text-destructive">{errors.provider.message}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <Label htmlFor="title">Title *</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Full descriptive name of the service
          </p>
        </div>
        <Input id="title" {...register('title')} placeholder="e.g., Montimage Monitoring Tool" />
        {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div>
            <Label htmlFor="categoryId">Category *</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Functional category of the service
            </p>
          </div>
          <Select
            value={watch('categoryId')}
            onValueChange={(value) => setValue('categoryId', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category._id} value={category._id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.categoryId && (
            <p className="text-sm text-destructive">{errors.categoryId.message}</p>
          )}
        </div>

        {repositoryTable === 'OTHER_SERVICES' && (
          <div className="space-y-2">
            <div>
              <Label htmlFor="sectorId">NIS2 Sector</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Critical infrastructure sector per NIS2 directive
              </p>
            </div>
            <Select
              value={watch('sectorId') || ''}
              onValueChange={(value) => setValue('sectorId', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select sector" />
              </SelectTrigger>
              <SelectContent>
                {sectors.map((sector) => (
                  <SelectItem key={sector._id} value={sector._id}>
                    {sector.name}
                    <span className="ml-2 text-xs text-muted-foreground">({sector.category})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div>
            <Label htmlFor="type">Type</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Whether this is a software, hardware, or hybrid solution
            </p>
          </div>
          <Select
            value={watch('type')}
            onValueChange={(value) => setValue('type', value as ServiceFormValues['type'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Software">Software</SelectItem>
              <SelectItem value="Hardware">Hardware</SelectItem>
              <SelectItem value="Software/Hardware">Software/Hardware</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div>
            <Label htmlFor="uiType">User Interface Type</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              How users interact with this service during deployment
            </p>
          </div>
          <Select
            value={watch('uiType')}
            onValueChange={(value) => setValue('uiType', value as ServiceFormValues['uiType'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="web">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Web Dashboard
                </div>
              </SelectItem>
              <SelectItem value="terminal">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4" />
                  Terminal
                </div>
              </SelectItem>
              <SelectItem value="both">
                <div className="flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  Web + Terminal
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <Label htmlFor="description">Description</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Detailed explanation of what the service does and its capabilities
          </p>
        </div>
        <Textarea
          id="description"
          {...register('description')}
          placeholder="Describe the service..."
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div>
            <Label htmlFor="license">License</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Software license type</p>
          </div>
          <Popover open={isLicensePopoverOpen} onOpenChange={setIsLicensePopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between font-normal"
              >
                {watch('license') || 'Select license...'}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[350px] p-0" align="start">
              <div className="p-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search licenses..."
                    value={licenseSearch}
                    onChange={(e) => setLicenseSearch(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
              </div>
              <ScrollArea className="h-64">
                <div className="p-2">
                  {(() => {
                    const filteredLicenses = [
                      {
                        value: 'MIT',
                        label: 'MIT License',
                        description: 'Permissive, minimal restrictions',
                      },
                      {
                        value: 'Apache-2.0',
                        label: 'Apache License 2.0',
                        description: 'Permissive with patent protection',
                      },
                      {
                        value: 'GPL-3.0',
                        label: 'GNU GPL v3.0',
                        description: 'Strong copyleft, derivative works must be open',
                      },
                      {
                        value: 'BSD-3-Clause',
                        label: 'BSD 3-Clause',
                        description: 'Permissive, requires attribution',
                      },
                      {
                        value: 'Proprietary',
                        label: 'Proprietary',
                        description: 'Closed source, all rights reserved',
                      },
                    ].filter(
                      (l) =>
                        l.label.toLowerCase().includes(licenseSearch.toLowerCase()) ||
                        l.value.toLowerCase().includes(licenseSearch.toLowerCase()) ||
                        l.description.toLowerCase().includes(licenseSearch.toLowerCase())
                    );

                    if (filteredLicenses.length === 0) {
                      return (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          No licenses found
                        </div>
                      );
                    }

                    return filteredLicenses.map((license) => {
                      const isSelected = watch('license') === license.value;
                      return (
                        <div
                          key={license.value}
                          className={`flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent cursor-pointer ${
                            isSelected ? 'bg-accent' : ''
                          }`}
                          onClick={() => {
                            setValue('license', license.value);
                            setLicenseSearch('');
                            setIsLicensePopoverOpen(false);
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{license.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {license.description}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </ScrollArea>
              <div className="border-t p-2">
                <p className="text-xs text-muted-foreground mb-2">
                  Can&apos;t find your license? Add a custom one:
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter custom license..."
                    value={customLicenseInput}
                    onChange={(e) => setCustomLicenseInput(e.target.value)}
                    className="h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customLicenseInput.trim()) {
                        e.preventDefault();
                        setValue('license', customLicenseInput.trim());
                        setCustomLicenseInput('');
                        setIsLicensePopoverOpen(false);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => {
                      if (customLicenseInput.trim()) {
                        setValue('license', customLicenseInput.trim());
                        setCustomLicenseInput('');
                        setIsLicensePopoverOpen(false);
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {watch('license') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground mt-2"
                    onClick={() => {
                      setValue('license', '');
                      setIsLicensePopoverOpen(false);
                    }}
                  >
                    Clear selection
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Versions Editor (extracted) */}
      <VersionsEditor value={versions} onChange={handleVersionsChange} />

      <div className="grid grid-cols-2 gap-4">
        <TrlSection
          label="TRL Current"
          value={trlCurrent || 5}
          description="Current Technology Readiness Level (1-9)"
          levels={TRL_LEVELS}
          onChange={(value) => setValue('trlCurrent', value)}
        />
        <TrlSection
          label="TRL Expected"
          value={trlExpected || 7}
          description="Target Technology Readiness Level by project end"
          levels={TRL_LEVELS}
          onChange={(value) => setValue('trlExpected', value)}
        />
      </div>

      {/* Standards Editor (extracted) */}
      <StandardsEditor
        value={standards}
        onChange={(newStandards) => formState.setStandards(newStandards)}
      />

      {/* Interacts With (extracted) */}
      <InteractsWithEditor
        selected={interactsWith}
        allServices={allServices.map((s) => ({
          _id: s._id,
          shortName: s.shortName,
          title: s.title,
          repositoryTable: s.repositoryTable,
        }))}
        editingServiceId={service?._id}
        onAdd={(shortName) => formState.addInteractsWith(shortName)}
        onRemove={(index) => formState.removeInteractsWith(index)}
        onClear={() => formState.setInteractsWith([])}
      />

      {/* Use Cases */}
      <div className="space-y-2">
        <div>
          <Label>Potential Use Cases</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Scenarios where this service can be applied
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            value={useCaseInput}
            onChange={(e) => setUseCaseInput(e.target.value)}
            placeholder="Describe a use case..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag(useCaseInput, formState.setUseCases, setUseCaseInput);
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => addTag(useCaseInput, formState.setUseCases, setUseCaseInput)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {useCases.map((item, i) => (
            <Badge key={i} variant="secondary" className="gap-1">
              {item}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => removeTag(i, formState.setUseCases)}
              />
            </Badge>
          ))}
        </div>
      </div>

      {/* Inputs */}
      <div className="space-y-2">
        <div>
          <Label>Inputs</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Data or resources this service requires to operate
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Name"
            value={inputName}
            onChange={(e) => setInputName(e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Description (optional)"
            value={inputDesc}
            onChange={(e) => setInputDesc(e.target.value)}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              addInputOutput('input', inputName, inputDesc);
              setInputName('');
              setInputDesc('');
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-1">
          {inputs.map((input, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md bg-muted p-2 text-sm">
              <span className="font-medium">{input.name}</span>
              {input.description && (
                <span className="text-muted-foreground">- {input.description}</span>
              )}
              <X
                className="ml-auto h-4 w-4 cursor-pointer"
                onClick={() => removeInputOutput('input', i)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Outputs */}
      <div className="space-y-2">
        <div>
          <Label>Outputs</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Data or results this service produces
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Name"
            value={outputName}
            onChange={(e) => setOutputName(e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Description (optional)"
            value={outputDesc}
            onChange={(e) => setOutputDesc(e.target.value)}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              addInputOutput('output', outputName, outputDesc);
              setOutputName('');
              setOutputDesc('');
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-1">
          {outputs.map((output, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md bg-muted p-2 text-sm">
              <span className="font-medium">{output.name}</span>
              {output.description && (
                <span className="text-muted-foreground">- {output.description}</span>
              )}
              <X
                className="ml-auto h-4 w-4 cursor-pointer"
                onClick={() => removeInputOutput('output', i)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? 'Saving...'
            : service
              ? repositoryTable === 'INTACT_TOOLBOX'
                ? 'Update Tool'
                : 'Update Service'
              : repositoryTable === 'INTACT_TOOLBOX'
                ? 'Create Tool'
                : 'Create Service'}
        </Button>
      </div>
    </form>
  );
}
