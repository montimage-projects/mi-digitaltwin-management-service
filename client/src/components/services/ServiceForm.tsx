import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { categoriesApi, sectorsApi, servicesApi, type Service, type CreateServiceData } from '@/lib/api';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Globe, Terminal, Monitor, ChevronsUpDown, Search, HelpCircle, Copy, Trash2 } from 'lucide-react';
import { useState } from 'react';

// Popular software licenses ordered by popularity
const SOFTWARE_LICENSES = [
  { value: 'MIT', label: 'MIT License', description: 'Permissive, minimal restrictions' },
  { value: 'Apache-2.0', label: 'Apache License 2.0', description: 'Permissive with patent protection' },
  { value: 'GPL-3.0', label: 'GNU GPL v3.0', description: 'Strong copyleft, derivative works must be open' },
  { value: 'BSD-3-Clause', label: 'BSD 3-Clause', description: 'Permissive, requires attribution' },
  { value: 'GPL-2.0', label: 'GNU GPL v2.0', description: 'Copyleft, predecessor to GPL v3' },
  { value: 'BSD-2-Clause', label: 'BSD 2-Clause', description: 'Simplified BSD, minimal restrictions' },
  { value: 'ISC', label: 'ISC License', description: 'Permissive, functionally equivalent to MIT' },
  { value: 'LGPL-3.0', label: 'GNU LGPL v3.0', description: 'Weak copyleft, allows proprietary linking' },
  { value: 'MPL-2.0', label: 'Mozilla Public License 2.0', description: 'Weak copyleft, file-level copyleft' },
  { value: 'AGPL-3.0', label: 'GNU AGPL v3.0', description: 'Strong copyleft, network use triggers' },
  { value: 'Unlicense', label: 'The Unlicense', description: 'Public domain dedication' },
  { value: 'CC0-1.0', label: 'CC0 1.0 Universal', description: 'Public domain, no rights reserved' },
  { value: 'WTFPL', label: 'WTFPL', description: 'Do What The F*** You Want Public License' },
  { value: 'Zlib', label: 'zlib License', description: 'Permissive, used in zlib library' },
  { value: 'EPL-2.0', label: 'Eclipse Public License 2.0', description: 'Weak copyleft, Eclipse Foundation' },
  { value: 'EUPL-1.2', label: 'European Union Public License 1.2', description: 'Copyleft, EU compatible' },
  { value: 'CC-BY-4.0', label: 'Creative Commons Attribution 4.0', description: 'For non-software works' },
  { value: 'CC-BY-SA-4.0', label: 'Creative Commons Attribution-ShareAlike 4.0', description: 'Share-alike for non-software' },
  { value: 'Proprietary', label: 'Proprietary', description: 'Closed source, all rights reserved' },
  { value: 'Commercial', label: 'Commercial License', description: 'Paid license required' },
];

// Technology Readiness Levels (TRL) definitions
const TRL_LEVELS = [
  { level: 1, name: 'Basic Principles', description: 'Basic principles observed and reported. Scientific research begins.' },
  { level: 2, name: 'Concept Formulated', description: 'Technology concept and/or application formulated. Practical applications identified.' },
  { level: 3, name: 'Proof of Concept', description: 'Analytical and experimental critical function proof of concept. Active R&D initiated.' },
  { level: 4, name: 'Lab Validation', description: 'Component and/or breadboard validation in laboratory environment.' },
  { level: 5, name: 'Lab Scale Prototype', description: 'Component and/or breadboard validation in relevant environment.' },
  { level: 6, name: 'Prototype Demo', description: 'System/subsystem model or prototype demonstration in relevant environment.' },
  { level: 7, name: 'System Prototype', description: 'System prototype demonstration in operational environment.' },
  { level: 8, name: 'System Complete', description: 'Actual system completed and qualified through test and demonstration.' },
  { level: 9, name: 'Production Ready', description: 'Actual system proven through successful mission operations. Ready for deployment.' },
];

// Comprehensive list of compliance standards
const COMPLIANCE_STANDARDS = [
  // ISO/IEC Standards
  { value: 'ISO/IEC 27001', label: 'ISO/IEC 27001', category: 'ISO/IEC Standards', description: 'Information Security Management' },
  { value: 'ISO/IEC 27002', label: 'ISO/IEC 27002', category: 'ISO/IEC Standards', description: 'Security Controls' },
  { value: 'ISO/IEC 27017', label: 'ISO/IEC 27017', category: 'ISO/IEC Standards', description: 'Cloud Security' },
  { value: 'ISO/IEC 27018', label: 'ISO/IEC 27018', category: 'ISO/IEC Standards', description: 'Cloud Privacy' },
  { value: 'ISO/IEC 27701', label: 'ISO/IEC 27701', category: 'ISO/IEC Standards', description: 'Privacy Information Management' },
  { value: 'ISO/IEC 22301', label: 'ISO/IEC 22301', category: 'ISO/IEC Standards', description: 'Business Continuity' },
  { value: 'ISO/IEC 20000', label: 'ISO/IEC 20000', category: 'ISO/IEC Standards', description: 'IT Service Management' },
  { value: 'ISO 9001', label: 'ISO 9001', category: 'ISO/IEC Standards', description: 'Quality Management' },
  // NIST Frameworks
  { value: 'NIST CSF', label: 'NIST CSF', category: 'NIST Frameworks', description: 'Cybersecurity Framework' },
  { value: 'NIST SP 800-53', label: 'NIST SP 800-53', category: 'NIST Frameworks', description: 'Security and Privacy Controls' },
  { value: 'NIST SP 800-171', label: 'NIST SP 800-171', category: 'NIST Frameworks', description: 'Protecting CUI' },
  { value: 'NIST SP 800-82', label: 'NIST SP 800-82', category: 'NIST Frameworks', description: 'ICS Security' },
  // EU Regulations
  { value: 'GDPR', label: 'GDPR', category: 'EU Regulations', description: 'General Data Protection Regulation' },
  { value: 'NIS2', label: 'NIS2', category: 'EU Regulations', description: 'Network and Information Security Directive' },
  { value: 'DORA', label: 'DORA', category: 'EU Regulations', description: 'Digital Operational Resilience Act' },
  { value: 'EU AI Act', label: 'EU AI Act', category: 'EU Regulations', description: 'Artificial Intelligence Regulation' },
  { value: 'eIDAS', label: 'eIDAS', category: 'EU Regulations', description: 'Electronic Identification' },
  // Industry Standards
  { value: 'PCI DSS', label: 'PCI DSS', category: 'Industry Standards', description: 'Payment Card Industry Data Security' },
  { value: 'SOC 2', label: 'SOC 2', category: 'Industry Standards', description: 'Service Organization Control' },
  { value: 'SOC 1', label: 'SOC 1', category: 'Industry Standards', description: 'Financial Reporting Controls' },
  { value: 'HIPAA', label: 'HIPAA', category: 'Industry Standards', description: 'Health Insurance Portability' },
  { value: 'HITRUST', label: 'HITRUST', category: 'Industry Standards', description: 'Health Information Trust' },
  // Industrial/OT Standards
  { value: 'IEC 62443', label: 'IEC 62443', category: 'Industrial Standards', description: 'Industrial Automation Security' },
  { value: 'NERC CIP', label: 'NERC CIP', category: 'Industrial Standards', description: 'Critical Infrastructure Protection' },
  { value: 'IEC 61850', label: 'IEC 61850', category: 'Industrial Standards', description: 'Power Utility Automation' },
  { value: 'IEC 62351', label: 'IEC 62351', category: 'Industrial Standards', description: 'Power Systems Security' },
  // Other Frameworks
  { value: 'CIS Controls', label: 'CIS Controls', category: 'Other Frameworks', description: 'Center for Internet Security' },
  { value: 'COBIT', label: 'COBIT', category: 'Other Frameworks', description: 'IT Governance Framework' },
  { value: 'CSA STAR', label: 'CSA STAR', category: 'Other Frameworks', description: 'Cloud Security Alliance' },
  { value: 'FedRAMP', label: 'FedRAMP', category: 'Other Frameworks', description: 'Federal Risk Authorization' },
  { value: 'CMMC', label: 'CMMC', category: 'Other Frameworks', description: 'Cybersecurity Maturity Model' },
  { value: 'TISAX', label: 'TISAX', category: 'Other Frameworks', description: 'Automotive Information Security' },
];

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

interface ServiceFormProps {
  service?: Service;
  onSubmit: (data: CreateServiceData) => Promise<void>;
  isSubmitting?: boolean;
  defaultTable?: 'INTACT_TOOLBOX' | 'OTHER_SERVICES';
}

export function ServiceForm({ service, onSubmit, isSubmitting, defaultTable }: ServiceFormProps) {
  const [standards, setStandards] = useState<string[]>(service?.standards || []);
  const [standardSearch, setStandardSearch] = useState('');
  const [customStandardInput, setCustomStandardInput] = useState('');
  const [licenseSearch, setLicenseSearch] = useState('');
  const [customLicenseInput, setCustomLicenseInput] = useState('');
  const [isLicensePopoverOpen, setIsLicensePopoverOpen] = useState(false);
  const [isProviderPopoverOpen, setIsProviderPopoverOpen] = useState(false);
  const [interactsWith, setInteractsWith] = useState<string[]>(service?.interactsWith || []);
  const [interactsInput, setInteractsInput] = useState('');
  const [useCases, setUseCases] = useState<string[]>(service?.potentialUseCases || []);
  const [useCaseInput, setUseCaseInput] = useState('');
  const [inputs, setInputs] = useState<{ name: string; description?: string }[]>(service?.inputs || []);
  const [outputs, setOutputs] = useState<{ name: string; description?: string }[]>(service?.outputs || []);
  const [versions, setVersions] = useState<{ version: string; dockerImage: string; releaseNotes?: string }[]>(
    service?.versions?.map((v) => ({ version: v.version, dockerImage: v.dockerImage, releaseNotes: v.releaseNotes })) || []
  );

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
    queryFn: () => servicesApi.list({ limit: 1000 }),
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
    // Set currentVersion to the latest version if versions exist
    const latestVersion = versions.length > 0 ? versions[0].version : data.currentVersion;

    const serviceData: CreateServiceData = {
      shortName: data.shortName,
      title: data.title,
      categoryId: data.categoryId,
      sectorId: data.sectorId || undefined,
      provider: data.provider,
      description: data.description,
      type: data.type,
      uiType: data.uiType,
      trl: {
        current: data.trlCurrent,
        expected: data.trlExpected,
      },
      license: data.license,
      repositoryTable: data.repositoryTable,
      currentVersion: latestVersion,
      standards,
      inputs,
      outputs,
      interactsWith,
      potentialUseCases: useCases,
      versions,
    };
    onSubmit(serviceData);
  };

  const addTag = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    inputSetter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    if (value.trim()) {
      setter((prev) => [...prev, value.trim()]);
      inputSetter('');
    }
  };

  const removeTag = (index: number, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((prev) => prev.filter((_, i) => i !== index));
  };

  const addInputOutput = (
    type: 'input' | 'output',
    name: string,
    description: string
  ) => {
    if (name.trim()) {
      const item = { name: name.trim(), description: description.trim() || undefined };
      if (type === 'input') {
        setInputs((prev) => [...prev, item]);
      } else {
        setOutputs((prev) => [...prev, item]);
      }
    }
  };

  const removeInputOutput = (type: 'input' | 'output', index: number) => {
    if (type === 'input') {
      setInputs((prev) => prev.filter((_, i) => i !== index));
    } else {
      setOutputs((prev) => prev.filter((_, i) => i !== index));
    }
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
                // Delay closing to allow clicking on suggestions
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
                      const filteredProviders = existingProviders.filter(
                        (p) => p.toLowerCase().includes(currentValue.toLowerCase())
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
          {errors.provider && (
            <p className="text-sm text-destructive">{errors.provider.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <Label htmlFor="title">Title *</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Full descriptive name of the service
          </p>
        </div>
        <Input
          id="title"
          {...register('title')}
          placeholder="e.g., Montimage Monitoring Tool"
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
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
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({sector.category})
                    </span>
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
            <p className="text-xs text-muted-foreground mt-0.5">
              Software license type
            </p>
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
                    const filteredLicenses = SOFTWARE_LICENSES.filter(
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
              {/* Add custom license */}
              <div className="border-t p-2">
                <p className="text-xs text-muted-foreground mb-2">
                  Can't find your license? Add a custom one:
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

      {/* Versions & Docker Images */}
      <div className="space-y-2">
        <div>
          <Label>Versions & Docker Images</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Release versions with their Docker image URLs
          </p>
        </div>
        <div className="space-y-3">
          {versions.map((ver, index) => (
            <div key={index} className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="font-mono">
                  v{ver.version}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => setVersions(versions.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-background px-2 py-1.5 rounded border font-mono truncate">
                  {ver.dockerImage}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(ver.dockerImage);
                  }}
                  title="Copy Docker image URL"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              {ver.releaseNotes && (
                <p className="text-xs text-muted-foreground">{ver.releaseNotes}</p>
              )}
            </div>
          ))}
        </div>
        {/* Add new version */}
        <div className="border rounded-lg p-3 space-y-3 border-dashed">
          <p className="text-xs font-medium text-muted-foreground">Add new version</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="newVersion" className="text-xs">Version *</Label>
              <Input
                id="newVersion"
                placeholder="e.g., 1.0.0"
                className="h-8 text-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="newDockerImage" className="text-xs">Docker Image URL *</Label>
              <Input
                id="newDockerImage"
                placeholder="e.g., registry.example.com/image:v1.0.0"
                className="h-8 text-sm font-mono"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="newReleaseNotes" className="text-xs">Release Notes</Label>
            <Input
              id="newReleaseNotes"
              placeholder="e.g., Initial release, Bug fixes, New features..."
              className="h-8 text-sm"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              const versionEl = document.getElementById('newVersion') as HTMLInputElement;
              const dockerEl = document.getElementById('newDockerImage') as HTMLInputElement;
              const notesEl = document.getElementById('newReleaseNotes') as HTMLInputElement;

              if (versionEl.value.trim() && dockerEl.value.trim()) {
                const newVersion = {
                  version: versionEl.value.trim(),
                  dockerImage: dockerEl.value.trim(),
                  releaseNotes: notesEl.value.trim() || undefined,
                };
                // Add to beginning of array (newest first)
                setVersions([newVersion, ...versions]);
                versionEl.value = '';
                dockerEl.value = '';
                notesEl.value = '';
              }
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Version
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div>
            <div className="flex items-center gap-1.5">
              <Label>TRL Current: {trlCurrent}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground hover:text-foreground"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <div className="p-3 border-b">
                    <h4 className="font-semibold text-sm">Technology Readiness Levels (TRL)</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      A measurement system to assess the maturity of a technology
                    </p>
                  </div>
                  <ScrollArea className="h-72">
                    <div className="p-2 space-y-1">
                      {TRL_LEVELS.map((trl) => (
                        <div
                          key={trl.level}
                          className={`flex gap-3 p-2 rounded-md ${
                            trl.level === trlCurrent ? 'bg-primary/10 border border-primary/20' : 'hover:bg-accent'
                          }`}
                        >
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-sm font-bold text-primary">{trl.level}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{trl.name}</div>
                            <div className="text-xs text-muted-foreground">{trl.description}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Current Technology Readiness Level (1-9)
            </p>
          </div>
          <Slider
            value={[trlCurrent || 5]}
            onValueChange={([value]) => setValue('trlCurrent', value)}
            min={1}
            max={9}
            step={1}
          />
          {trlCurrent && TRL_LEVELS[trlCurrent - 1] && (
            <div className="mt-2 p-2 rounded-md bg-muted/50">
              <p className="text-xs font-medium text-foreground">
                {TRL_LEVELS[trlCurrent - 1].name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {TRL_LEVELS[trlCurrent - 1].description}
              </p>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <div>
            <div className="flex items-center gap-1.5">
              <Label>TRL Expected: {trlExpected}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground hover:text-foreground"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <div className="p-3 border-b">
                    <h4 className="font-semibold text-sm">Technology Readiness Levels (TRL)</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      A measurement system to assess the maturity of a technology
                    </p>
                  </div>
                  <ScrollArea className="h-72">
                    <div className="p-2 space-y-1">
                      {TRL_LEVELS.map((trl) => (
                        <div
                          key={trl.level}
                          className={`flex gap-3 p-2 rounded-md ${
                            trl.level === trlExpected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-accent'
                          }`}
                        >
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-sm font-bold text-primary">{trl.level}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{trl.name}</div>
                            <div className="text-xs text-muted-foreground">{trl.description}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Target Technology Readiness Level by project end
            </p>
          </div>
          <Slider
            value={[trlExpected || 7]}
            onValueChange={([value]) => setValue('trlExpected', value)}
            min={1}
            max={9}
            step={1}
          />
          {trlExpected && TRL_LEVELS[trlExpected - 1] && (
            <div className="mt-2 p-2 rounded-md bg-muted/50">
              <p className="text-xs font-medium text-foreground">
                {TRL_LEVELS[trlExpected - 1].name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {TRL_LEVELS[trlExpected - 1].description}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Standards */}
      <div className="space-y-2">
        <div>
          <Label>Standards</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Compliance standards this service adheres to
          </p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className="w-full justify-between font-normal"
            >
              {standards.length === 0
                ? 'Select standards...'
                : `${standards.length} standard${standards.length > 1 ? 's' : ''} selected`}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="start">
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search standards..."
                  value={standardSearch}
                  onChange={(e) => setStandardSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
            </div>
            <ScrollArea className="h-72">
              <div className="p-2">
                {(() => {
                  const filteredStandards = COMPLIANCE_STANDARDS.filter(
                    (s) =>
                      s.label.toLowerCase().includes(standardSearch.toLowerCase()) ||
                      s.description.toLowerCase().includes(standardSearch.toLowerCase())
                  );
                  const categories = [...new Set(filteredStandards.map((s) => s.category))];

                  if (filteredStandards.length === 0) {
                    return (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        No standards found
                      </div>
                    );
                  }

                  return categories.map((category) => (
                    <div key={category} className="mb-3">
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {category}
                      </div>
                      {filteredStandards
                        .filter((s) => s.category === category)
                        .map((standard) => {
                          const isSelected = standards.includes(standard.value);
                          return (
                            <div
                              key={standard.value}
                              className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent cursor-pointer"
                              onClick={() => {
                                if (isSelected) {
                                  setStandards(standards.filter((s) => s !== standard.value));
                                } else {
                                  setStandards([...standards, standard.value]);
                                }
                              }}
                            >
                              <Checkbox checked={isSelected} />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium">{standard.label}</div>
                                <div className="text-xs text-muted-foreground">
                                  {standard.description}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ));
                })()}
              </div>
            </ScrollArea>
            {/* Add custom standard */}
            <div className="border-t p-2">
              <p className="text-xs text-muted-foreground mb-2">
                Can't find your standard? Add a custom one:
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter custom standard name..."
                  value={customStandardInput}
                  onChange={(e) => setCustomStandardInput(e.target.value)}
                  className="h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customStandardInput.trim()) {
                      e.preventDefault();
                      if (!standards.includes(customStandardInput.trim())) {
                        setStandards([...standards, customStandardInput.trim()]);
                      }
                      setCustomStandardInput('');
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => {
                    if (customStandardInput.trim() && !standards.includes(customStandardInput.trim())) {
                      setStandards([...standards, customStandardInput.trim()]);
                      setCustomStandardInput('');
                    }
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {standards.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground mt-2"
                  onClick={() => setStandards([])}
                >
                  Clear all
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
        {standards.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {standards.map((standard, i) => (
              <Badge key={i} variant="secondary" className="gap-1">
                {standard}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setStandards(standards.filter((_, idx) => idx !== i))}
                />
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Interacts With */}
      <div className="space-y-2">
        <div>
          <Label>Interacts With</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Other services or tools this service integrates with
          </p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className="w-full justify-between font-normal"
            >
              {interactsWith.length === 0
                ? 'Select services...'
                : `${interactsWith.length} service${interactsWith.length > 1 ? 's' : ''} selected`}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="start">
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search services..."
                  value={interactsInput}
                  onChange={(e) => setInteractsInput(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
            </div>
            <ScrollArea className="h-72">
              <div className="p-2">
                {(() => {
                  // Filter out current service being edited and filter by search
                  const availableServices = allServices.filter(
                    (s) =>
                      s._id !== service?._id &&
                      (s.shortName.toLowerCase().includes(interactsInput.toLowerCase()) ||
                        s.title.toLowerCase().includes(interactsInput.toLowerCase()))
                  );

                  // Group by repository table
                  const toolboxServices = availableServices.filter(
                    (s) => s.repositoryTable === 'INTACT_TOOLBOX'
                  );
                  const infraServices = availableServices.filter(
                    (s) => s.repositoryTable === 'OTHER_SERVICES'
                  );

                  if (availableServices.length === 0) {
                    return (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        No services found
                      </div>
                    );
                  }

                  return (
                    <>
                      {toolboxServices.length > 0 && (
                        <div className="mb-3">
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Security Tools (INTACT Toolbox)
                          </div>
                          {toolboxServices.map((svc) => {
                            const isSelected = interactsWith.includes(svc.shortName);
                            return (
                              <div
                                key={svc._id}
                                className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent cursor-pointer"
                                onClick={() => {
                                  if (isSelected) {
                                    setInteractsWith(interactsWith.filter((s) => s !== svc.shortName));
                                  } else {
                                    setInteractsWith([...interactsWith, svc.shortName]);
                                  }
                                }}
                              >
                                <Checkbox checked={isSelected} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium">{svc.shortName}</div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {svc.title}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {infraServices.length > 0 && (
                        <div className="mb-3">
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Critical Infrastructure Services
                          </div>
                          {infraServices.map((svc) => {
                            const isSelected = interactsWith.includes(svc.shortName);
                            return (
                              <div
                                key={svc._id}
                                className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent cursor-pointer"
                                onClick={() => {
                                  if (isSelected) {
                                    setInteractsWith(interactsWith.filter((s) => s !== svc.shortName));
                                  } else {
                                    setInteractsWith([...interactsWith, svc.shortName]);
                                  }
                                }}
                              >
                                <Checkbox checked={isSelected} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium">{svc.shortName}</div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {svc.title}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </ScrollArea>
            {interactsWith.length > 0 && (
              <div className="border-t p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  onClick={() => setInteractsWith([])}
                >
                  Clear all
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
        {interactsWith.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {interactsWith.map((item, i) => (
              <Badge key={i} variant="outline" className="gap-1">
                {item}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setInteractsWith(interactsWith.filter((_, idx) => idx !== i))}
                />
              </Badge>
            ))}
          </div>
        )}
      </div>

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
                addTag(useCaseInput, setUseCases, setUseCaseInput);
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => addTag(useCaseInput, setUseCases, setUseCaseInput)}
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
                onClick={() => removeTag(i, setUseCases)}
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
            id="inputName"
            placeholder="Name"
            className="flex-1"
          />
          <Input
            id="inputDesc"
            placeholder="Description (optional)"
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              const nameEl = document.getElementById('inputName') as HTMLInputElement;
              const descEl = document.getElementById('inputDesc') as HTMLInputElement;
              addInputOutput('input', nameEl.value, descEl.value);
              nameEl.value = '';
              descEl.value = '';
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
            id="outputName"
            placeholder="Name"
            className="flex-1"
          />
          <Input
            id="outputDesc"
            placeholder="Description (optional)"
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              const nameEl = document.getElementById('outputName') as HTMLInputElement;
              const descEl = document.getElementById('outputDesc') as HTMLInputElement;
              addInputOutput('output', nameEl.value, descEl.value);
              nameEl.value = '';
              descEl.value = '';
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
