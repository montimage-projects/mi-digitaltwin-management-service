import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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

interface ServiceDropdownProps {
  icon: React.ReactNode;
  buttonLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  noMatchLabel: string;
  services: ServiceOption[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  groupedServices: Record<string, ServiceOption[]>;
  selectedService: ServiceOption | null;
  selectedVersion: string;
  onVersionChange: (version: string) => void;
  onServiceSelect: (service: ServiceOption) => void;
  onConfirmAdd: () => void;
  onCancelVersion: () => void;
  disabled: boolean;
}

export function ServiceDropdown({
  icon,
  buttonLabel,
  searchPlaceholder,
  emptyLabel,
  noMatchLabel,
  services,
  searchQuery,
  onSearchChange,
  groupedServices,
  selectedService,
  selectedVersion,
  onVersionChange,
  onServiceSelect,
  onConfirmAdd,
  onCancelVersion,
  disabled,
}: ServiceDropdownProps) {
  const isVersionView =
    selectedService !== null &&
    services.includes(selectedService) &&
    selectedService.versions &&
    selectedService.versions.length > 1 &&
    selectedService.repositoryTable === services[0]?.repositoryTable;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8" disabled={disabled}>
          {icon}
          {buttonLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        {isVersionView ? (
          // Version selection view
          <div className="p-3">
            <div className="flex items-center gap-2 mb-3">
              {icon}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{selectedService.shortName}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {selectedService.title}
                </div>
              </div>
            </div>
            <div className="mb-3">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Select Version
              </label>
              <Select value={selectedVersion} onValueChange={onVersionChange}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent>
                  {selectedService.versions?.map((v) => (
                    <SelectItem key={v.version} value={v.version}>
                      {v.version}
                      {v.version === selectedService.currentVersion && ' (latest)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={onCancelVersion}>
                Cancel
              </Button>
              <Button size="sm" className="flex-1" onClick={onConfirmAdd}>
                Add Service
              </Button>
            </div>
          </div>
        ) : (
          // Service list view
          <>
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
            </div>
            <ScrollArea className="h-72">
              {services.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">{emptyLabel}</div>
              ) : Object.keys(groupedServices).length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">{noMatchLabel}</div>
              ) : (
                <div className="p-2">
                  {Object.entries(groupedServices).map(([category, categoryServices]) => (
                    <div key={category} className="mb-3">
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {category}
                      </div>
                      {categoryServices.map((service) => (
                        <button
                          key={service._id}
                          onClick={() => onServiceSelect(service)}
                          className="w-full flex items-center gap-2 px-2 py-2 text-left rounded-md hover:bg-accent transition-colors"
                        >
                          {icon}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{service.shortName}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {service.title}
                              {service.versions && service.versions.length > 1 && (
                                <span className="ml-1 text-muted-foreground/60">
                                  ({service.versions.length} versions)
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
