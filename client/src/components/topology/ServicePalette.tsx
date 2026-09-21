import { useState, useMemo, useCallback } from 'react';
import { Shield, Server } from 'lucide-react';
import { ServiceDropdown } from './ServiceDropdown';

interface ServiceVersion {
  version: string;
  dockerImage: string;
  releaseNotes?: string;
  releasedAt: string;
}

interface ServiceOption {
  _id: string;
  shortName: string;
  title: string;
  description?: string;
  categoryId?: { name: string };
  repositoryTable?: 'INTACT_TOOLBOX' | 'OTHER_SERVICES';
  currentVersion?: string;
  versions?: ServiceVersion[];
  uiType?: string;
}

interface ServicePaletteProps {
  services: ServiceOption[];
  readOnly?: boolean;
  onAddToolboxService: (service: ServiceOption, version?: string) => void;
  onAddInfraService: (service: ServiceOption, version?: string) => void;
}

export function ServicePalette({
  services,
  readOnly,
  onAddToolboxService,
  onAddInfraService,
}: ServicePaletteProps) {
  // Search state for each dropdown (dropdown open state is internal)
  const [toolboxSearch, setToolboxSearch] = useState('');
  const [infraSearch, setInfraSearch] = useState('');

  // Selected service and version for version selection
  const [selectedService, setSelectedService] = useState<ServiceOption | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>('');

  // Filter services by repository table
  const toolboxServices = useMemo(() => {
    return services.filter((s) => s.repositoryTable === 'INTACT_TOOLBOX');
  }, [services]);

  const infraServices = useMemo(() => {
    return services.filter((s) => s.repositoryTable === 'OTHER_SERVICES');
  }, [services]);

  // Helper function to group and filter services
  const getGroupedServices = (serviceList: ServiceOption[], searchQuery: string) => {
    const filtered = serviceList.filter((s) => {
      const query = searchQuery.toLowerCase();
      return (
        s.shortName.toLowerCase().includes(query) ||
        s.title.toLowerCase().includes(query) ||
        s.categoryId?.name?.toLowerCase().includes(query) ||
        (s.description && s.description.toLowerCase().includes(query))
      );
    });

    const groups: Record<string, ServiceOption[]> = {};
    filtered.forEach((service) => {
      const category = service.categoryId?.name || 'Uncategorized';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(service);
    });

    return groups;
  };

  // Grouped services for each dropdown
  const groupedToolboxServices = useMemo(() => {
    return getGroupedServices(toolboxServices, toolboxSearch);
  }, [toolboxServices, toolboxSearch]);

  const groupedInfraServices = useMemo(() => {
    return getGroupedServices(infraServices, infraSearch);
  }, [infraServices, infraSearch]);

  // Handle service selection (opens version selector if multiple versions available)
  const handleServiceSelect = useCallback(
    (service: ServiceOption, isToolbox: boolean) => {
      if (service.versions && service.versions.length > 1) {
        // Service has multiple versions - show version selector
        setSelectedService(service);
        setSelectedVersion(service.currentVersion || service.versions[0]?.version || '');
      } else {
        // Single version or no versions - add directly
        if (isToolbox) {
          onAddToolboxService(service);
        } else {
          onAddInfraService(service);
        }
      }
    },
    [onAddToolboxService, onAddInfraService]
  );

  // Confirm adding service with selected version
  const confirmAddService = useCallback(
    (isToolbox: boolean) => {
      if (selectedService) {
        if (isToolbox) {
          onAddToolboxService(selectedService, selectedVersion);
        } else {
          onAddInfraService(selectedService, selectedVersion);
        }
      }
    },
    [selectedService, selectedVersion, onAddToolboxService, onAddInfraService]
  );

  // Cancel version selection
  const cancelVersionSelection = useCallback(() => {
    setSelectedService(null);
    setSelectedVersion('');
  }, []);

  if (readOnly) {
    return null;
  }

  return (
    <>
      {/* Add Security Tool (Toolbox) */}
      <ServiceDropdown
        icon={<Shield className="h-4 w-4 mr-1" />}
        buttonLabel="Add Security Tool"
        searchPlaceholder="Search security tools..."
        emptyLabel="No security tools available"
        noMatchLabel="No security tools match your search"
        services={toolboxServices}
        searchQuery={toolboxSearch}
        onSearchChange={setToolboxSearch}
        groupedServices={groupedToolboxServices}
        selectedService={selectedService}
        selectedVersion={selectedVersion}
        onVersionChange={setSelectedVersion}
        onServiceSelect={(service) => handleServiceSelect(service, true)}
        onConfirmAdd={() => confirmAddService(true)}
        onCancelVersion={cancelVersionSelection}
        disabled={toolboxServices.length === 0}
      />

      {/* Add Infrastructure Service (Critical Infrastructure) */}
      <ServiceDropdown
        icon={<Server className="h-4 w-4 mr-1" />}
        buttonLabel="Add Target"
        searchPlaceholder="Search infrastructure services..."
        emptyLabel="No infrastructure services available"
        noMatchLabel="No infrastructure services match your search"
        services={infraServices}
        searchQuery={infraSearch}
        onSearchChange={setInfraSearch}
        groupedServices={groupedInfraServices}
        selectedService={selectedService}
        selectedVersion={selectedVersion}
        onVersionChange={setSelectedVersion}
        onServiceSelect={(service) => handleServiceSelect(service, false)}
        onConfirmAdd={() => confirmAddService(false)}
        onCancelVersion={cancelVersionSelection}
        disabled={infraServices.length === 0}
      />
    </>
  );
}
