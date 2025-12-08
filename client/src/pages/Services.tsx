import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus } from 'lucide-react';
import { servicesApi, categoriesApi, type Service } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [providerFilter, setProviderFilter] = useState<string>('');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesApi.list,
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

  // Get unique providers
  const providers = useMemo(() => {
    const allServices = [
      ...(toolboxData?.services || []),
      ...(infrastructureData?.services || []),
    ];
    return [...new Set(allServices.map((s) => s.provider))].sort();
  }, [toolboxData, infrastructureData]);

  // Filter services
  const filterServices = (services: Service[] = []) => {
    return services.filter((service) => {
      const matchesSearch =
        !search ||
        service.shortName.toLowerCase().includes(search.toLowerCase()) ||
        service.title.toLowerCase().includes(search.toLowerCase());

      const matchesCategory =
        categoryFilter === 'all' || !categoryFilter || service.categoryId?._id === categoryFilter;

      const matchesProvider =
        providerFilter === 'all' || !providerFilter || service.provider === providerFilter;

      return matchesSearch && matchesCategory && matchesProvider;
    });
  };

  const toolboxServices = filterServices(toolboxData?.services);
  const infrastructureServices = filterServices(infrastructureData?.services);

  const handleRowClick = (service: Service) => {
    setSelectedService(service);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Service Repository</h1>
          <p className="text-muted-foreground">
            Browse and explore INTACT cybersecurity services
          </p>
        </div>
        <Button onClick={() => navigate('/services/add')}>
          <Plus className="mr-2 h-4 w-4" />
          Add Service
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
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

        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Providers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            {providers.map((provider) => (
              <SelectItem key={provider} value={provider}>
                {provider}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* INTACT Toolbox Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">INTACT Toolbox</h2>
          <span className="text-sm text-muted-foreground">
            {toolboxServices.length} services
          </span>
        </div>
        <ServiceTable
          services={toolboxServices}
          isLoading={toolboxLoading}
          onRowClick={handleRowClick}
        />
      </div>

      {/* Critical Infrastructure Services Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Critical Infrastructure Services</h2>
          <span className="text-sm text-muted-foreground">
            {infrastructureServices.length} services
          </span>
        </div>
        <ServiceTable
          services={infrastructureServices}
          isLoading={infrastructureLoading}
          onRowClick={handleRowClick}
        />
      </div>

      {/* Service Detail Drawer */}
      <ServiceDrawer
        service={selectedService}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedService(null);
        }}
      />
    </div>
  );
}
