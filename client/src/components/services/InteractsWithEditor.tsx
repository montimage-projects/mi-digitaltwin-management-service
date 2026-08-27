import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronsUpDown, Search, X } from 'lucide-react';

export interface ServiceOption {
  _id: string;
  shortName: string;
  title: string;
  repositoryTable: 'INTACT_TOOLBOX' | 'OTHER_SERVICES';
}

export interface InteractsWithEditorProps {
  selected: string[];
  allServices: ServiceOption[];
  editingServiceId?: string;
  onAdd: (shortName: string) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
}

export function InteractsWithEditor({
  selected,
  allServices,
  editingServiceId,
  onAdd,
  onRemove,
  onClear,
}: InteractsWithEditorProps) {
  const [search, setSearch] = useState('');

  const availableServices = allServices.filter(
    (s) =>
      s._id !== editingServiceId &&
      (s.shortName.toLowerCase().includes(search.toLowerCase()) ||
        s.title.toLowerCase().includes(search.toLowerCase()))
  );

  const toolboxServices = availableServices.filter((s) => s.repositoryTable === 'INTACT_TOOLBOX');
  const infraServices = availableServices.filter((s) => s.repositoryTable === 'OTHER_SERVICES');

  const handleToggle = (shortName: string) => {
    if (selected.includes(shortName)) {
      onRemove(selected.indexOf(shortName));
    } else {
      onAdd(shortName);
    }
  };

  return (
    <div className="space-y-2">
      <div>
        <Label>Interacts With</Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          Other services or tools this service integrates with
        </p>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
            {selected.length === 0
              ? 'Select services...'
              : `${selected.length} service${selected.length > 1 ? 's' : ''} selected`}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search services..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </div>
          <ScrollArea className="h-72">
            <div className="p-2">
              {availableServices.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No services found
                </div>
              ) : (
                <>
                  {toolboxServices.length > 0 && (
                    <div className="mb-3">
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Security Tools (Toolbox)
                      </div>
                      {toolboxServices.map((svc) => {
                        const isSelected = selected.includes(svc.shortName);
                        return (
                          <div
                            key={svc._id}
                            className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent cursor-pointer"
                            onClick={() => handleToggle(svc.shortName)}
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
                        const isSelected = selected.includes(svc.shortName);
                        return (
                          <div
                            key={svc._id}
                            className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent cursor-pointer"
                            onClick={() => handleToggle(svc.shortName)}
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
              )}
            </div>
          </ScrollArea>
          {selected.length > 0 && (
            <div className="border-t p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={onClear}
              >
                Clear all
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((item, i) => (
            <Badge key={i} variant="outline" className="gap-1">
              {item}
              <X className="h-3 w-3 cursor-pointer" onClick={() => onRemove(i)} />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
