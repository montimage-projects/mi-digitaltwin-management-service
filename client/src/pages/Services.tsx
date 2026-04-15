import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, Shield, Server } from 'lucide-react';
import { servicesApi, categoriesApi, sectorsApi, type Service } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ServiceTable } from '@/components/services/ServiceTable';
import { ServiceDrawer } from '@/components/services/ServiceDrawer';

export function Services() {
  const navigate = useNavigate();
  const { id: serviceIdFromRoute } = useParams();
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Separate filters for each tab
  const [toolboxSearch, setToolboxSearch] = useState('');
  const [toolboxCategory, setToolboxCategory] = useState<string>('');
  const [toolboxProvider, setToolboxProvider] = useState<string>('');

  const [infraSearch, setInfraSearch] = useState('');
  const [infraSector, setInfraSector] = useState<string>('');
  const [infraProvider, setInfraProvider] = useState<string>('');

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesApi.list,
  });

  // Fetch sectors (for Critical Infrastructure Services)
  const { data: sectors = [] } = useQuery({
    queryKey: ['sectors'],
    queryFn: sectorsApi.list,
  });

  // Fetch all services for INTACT Toolbox
  const { data: toolboxData, isLoading: toolboxLoading } = useQuery({
    queryKey: ['services', 'INTACT_TOOLBOX'],
    queryFn: () => servicesApi.list({ table: 'INTACT_TOOLBOX', limit: 100 }),
  });

  // Fetch all services for Critical Infrastructure Services
  const { data: infrastructureData, isLoading: infrastructureLoading } = useQuery({
    queryKey: ['services', 'OTHER_SERVICES'],
    queryFn: () => servicesApi.list({ table: 'OTHER_SERVICES', limit: 100 }),
  });

  // Get unique providers for each table
  const toolboxProviders = useMemo(() => {
    return [...new Set((toolboxData?.services || []).map((s) => s.provider))].sort();
  }, [toolboxData]);

  const infraProviders = useMemo(() => {
    return [...new Set((infrastructureData?.services || []).map((s) => s.provider))].sort();
  }, [infrastructureData]);

  // Filter services helper for toolbox (uses category)
  const filterToolboxServices = (
    services: Service[] = [],
    search: string,
    categoryFilter: string,
    providerFilter: string
  ) => {
    return services.filter((service) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        service.shortName.toLowerCase().includes(searchLower) ||
        service.title.toLowerCase().includes(searchLower) ||
        service.categoryId?.name?.toLowerCase().includes(searchLower) ||
        service.description?.toLowerCase().includes(searchLower);

      const matchesCategory =
        categoryFilter === 'all' || !categoryFilter || service.categoryId?._id === categoryFilter;

      const matchesProvider =
        providerFilter === 'all' || !providerFilter || service.provider === providerFilter;

      return matchesSearch && matchesCategory && matchesProvider;
    });
  };

  // Filter services helper for infrastructure (uses sector)
  const filterInfraServices = (
    services: Service[] = [],
    search: string,
    sectorFilter: string,
    providerFilter: string
  ) => {
    return services.filter((service) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        service.shortName.toLowerCase().includes(searchLower) ||
        service.title.toLowerCase().includes(searchLower) ||
        service.sectorId?.name?.toLowerCase().includes(searchLower) ||
        service.description?.toLowerCase().includes(searchLower);

      const matchesSector =
        sectorFilter === 'all' || !sectorFilter || service.sectorId?._id === sectorFilter;

      const matchesProvider =
        providerFilter === 'all' || !providerFilter || service.provider === providerFilter;

      return matchesSearch && matchesSector && matchesProvider;
    });
  };

  const toolboxServices = filterToolboxServices(
    toolboxData?.services,
    toolboxSearch,
    toolboxCategory,
    toolboxProvider
  );
  const infrastructureServices = filterInfraServices(
    infrastructureData?.services,
    infraSearch,
    infraSector,
    infraProvider
  );

  const allServices = useMemo(
    () => [...(toolboxData?.services || []), ...(infrastructureData?.services || [])],
    [toolboxData, infrastructureData]
  );

  useEffect(() => {
    if (!serviceIdFromRoute) {
      return;
    }
    const matched = allServices.find((service) => service._id === serviceIdFromRoute);
    if (!matched) {
      return;
    }
    setSelectedService(matched);
    setDrawerOpen(true);
  }, [serviceIdFromRoute, allServices]);

  const handleRowClick = (service: Service) => {
    setSelectedService(service);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Service Repository</h1>
        <p className="text-muted-foreground">
          Security tools and protected infrastructure services
        </p>
      </div>

      {/* Tabbed Service Tables */}
      <Tabs defaultValue="toolbox" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="toolbox" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            INTACT Toolbox
            <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">
              {toolboxData?.services?.length || 0}
            </span>
          </TabsTrigger>
          <TabsTrigger value="infrastructure" className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            Critical Infrastructure Services
            <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">
              {infrastructureData?.services?.length || 0}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="toolbox" className="space-y-4">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm text-muted-foreground">
              Security tools for monitoring, attack simulation, auditing, and protection of critical
              infrastructure.
            </p>
          </div>
          {/* Toolbox Filters */}
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, title, category, description..."
                value={toolboxSearch}
                onChange={(e) => setToolboxSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={toolboxCategory} onValueChange={setToolboxCategory}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category._id} value={category._id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={toolboxProvider} onValueChange={setToolboxProvider}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Providers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Providers</SelectItem>
                {toolboxProviders.map((provider) => (
                  <SelectItem key={provider} value={provider}>
                    {provider}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => navigate('/services/add?table=INTACT_TOOLBOX')}>
              <Plus className="mr-2 h-4 w-4" />
              Add Tool
            </Button>
          </div>
          <ServiceTable
            services={toolboxServices}
            isLoading={toolboxLoading}
            onRowClick={handleRowClick}
          />
        </TabsContent>

        <TabsContent value="infrastructure" className="space-y-4">
          <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
            <p className="text-sm text-muted-foreground">
              Target services and systems that require protection and security testing, classified
              by NIS2 critical sectors.
            </p>
          </div>
          {/* Infrastructure Filters */}
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, title, sector, description..."
                value={infraSearch}
                onChange={(e) => setInfraSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={infraSector} onValueChange={setInfraSector}>
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="All Sectors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sectors</SelectItem>
                {sectors.map((sector) => (
                  <SelectItem key={sector._id} value={sector._id}>
                    {sector.name}
                    <span className="ml-2 text-xs text-muted-foreground">({sector.category})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={infraProvider} onValueChange={setInfraProvider}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Providers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Providers</SelectItem>
                {infraProviders.map((provider) => (
                  <SelectItem key={provider} value={provider}>
                    {provider}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => navigate('/services/add?table=OTHER_SERVICES')}>
              <Plus className="mr-2 h-4 w-4" />
              Add Service
            </Button>
          </div>
          <ServiceTable
            services={infrastructureServices}
            isLoading={infrastructureLoading}
            onRowClick={handleRowClick}
            showSector
          />
        </TabsContent>
      </Tabs>

      {/* Service Detail Drawer */}
      <ServiceDrawer
        service={selectedService}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedService(null);
          if (serviceIdFromRoute) {
            navigate('/services', { replace: true });
          }
        }}
      />
    </div>
  );
}
