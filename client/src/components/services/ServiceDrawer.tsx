import { useState } from 'react';
import { Copy, Globe, Terminal, Monitor } from 'lucide-react';
import type { Service } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ServiceDrawerProps {
  service: Service | null;
  open: boolean;
  onClose: () => void;
}

const UI_TYPE_ICONS = {
  web: Globe,
  terminal: Terminal,
  both: Monitor,
};

const UI_TYPE_LABELS = {
  web: 'Web Dashboard',
  terminal: 'Terminal',
  both: 'Web + Terminal',
};

export function ServiceDrawer({ service, open, onClose }: ServiceDrawerProps) {
  const [selectedVersion, setSelectedVersion] = useState<string>('');

  if (!service) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Get selected version or default to current version
  const activeVersionString = selectedVersion || service.currentVersion || '';
  const activeVersion =
    service.versions?.find((v) => v.version === activeVersionString) || service.versions?.[0];

  const UiTypeIcon = UI_TYPE_ICONS[service.uiType || 'web'];

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {service.shortName}
            <Badge variant="secondary">{service.currentVersion}</Badge>
          </SheetTitle>
          <SheetDescription>{service.title}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Basic Info */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Provider</span>
              <span className="font-medium">{service.provider}</span>
            </div>
            {service.repositoryTable === 'INTACT_TOOLBOX' ? (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Category</span>
                <Badge variant="outline">{service.categoryId?.name}</Badge>
              </div>
            ) : service.sectorId ? (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sector</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{service.sectorId.name}</Badge>
                  <span className="text-xs text-muted-foreground">
                    ({service.sectorId.category})
                  </span>
                </div>
              </div>
            ) : null}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium">{service.type}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">User Interface</span>
              <div className="flex items-center gap-1.5">
                <UiTypeIcon className="h-3.5 w-3.5" />
                <span className="font-medium">{UI_TYPE_LABELS[service.uiType || 'web']}</span>
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">License</span>
              <span className="font-medium">{service.license || 'N/A'}</span>
            </div>
          </div>

          <Separator />

          {/* TRL */}
          <div>
            <h4 className="mb-2 text-sm font-semibold">Technology Readiness Level</h4>
            <div className="flex gap-4">
              <div className="rounded-md border p-3 text-center">
                <p className="text-2xl font-bold text-primary">{service.trl?.current || '-'}</p>
                <p className="text-xs text-muted-foreground">Current</p>
              </div>
              <div className="rounded-md border p-3 text-center">
                <p className="text-2xl font-bold text-muted-foreground">
                  {service.trl?.expected || '-'}
                </p>
                <p className="text-xs text-muted-foreground">Expected</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Description */}
          <div>
            <h4 className="mb-2 text-sm font-semibold">Description</h4>
            <p className="text-sm text-muted-foreground">
              {service.description || 'No description available.'}
            </p>
          </div>

          {/* Standards */}
          {service.standards?.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="mb-2 text-sm font-semibold">Standards</h4>
                <div className="flex flex-wrap gap-1">
                  {service.standards.map((standard) => (
                    <Badge key={standard} variant="secondary">
                      {standard}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Inputs */}
          {service.inputs?.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="mb-2 text-sm font-semibold">Inputs</h4>
                <ul className="space-y-1 text-sm">
                  {service.inputs.map((input, i) => (
                    <li key={i} className="text-muted-foreground">
                      <span className="font-medium text-foreground">{input.name}</span>
                      {input.description && ` - ${input.description}`}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* Outputs */}
          {service.outputs?.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="mb-2 text-sm font-semibold">Outputs</h4>
                <ul className="space-y-1 text-sm">
                  {service.outputs.map((output, i) => (
                    <li key={i} className="text-muted-foreground">
                      <span className="font-medium text-foreground">{output.name}</span>
                      {output.description && ` - ${output.description}`}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* Interacts With */}
          {service.interactsWith?.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="mb-2 text-sm font-semibold">Interacts With</h4>
                <div className="flex flex-wrap gap-1">
                  {service.interactsWith.map((item) => (
                    <Badge key={item} variant="outline">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Use Cases */}
          {service.potentialUseCases?.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="mb-2 text-sm font-semibold">Potential Use Cases</h4>
                <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                  {service.potentialUseCases.map((useCase, i) => (
                    <li key={i}>{useCase}</li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* Version Selector & Docker Image */}
          {service.versions?.length > 0 && (
            <>
              <Separator />
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Version & Docker Image</h4>
                  <Select value={activeVersionString} onValueChange={setSelectedVersion}>
                    <SelectTrigger className="h-7 w-[120px]">
                      <SelectValue placeholder="Select version" />
                    </SelectTrigger>
                    <SelectContent>
                      {service.versions.map((v) => (
                        <SelectItem key={v.version} value={v.version}>
                          {v.version}
                          {v.version === service.currentVersion && ' (latest)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {activeVersion && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-md bg-muted p-2">
                      <code className="flex-1 truncate text-xs">{activeVersion.dockerImage}</code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(activeVersion.dockerImage)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Released: {new Date(activeVersion.releasedAt).toLocaleDateString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => copyToClipboard(activeVersion.version)}
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        Copy version
                      </Button>
                    </div>
                    {activeVersion.releaseNotes && (
                      <p className="text-xs text-muted-foreground">{activeVersion.releaseNotes}</p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Version History */}
          {service.versions?.length > 1 && (
            <>
              <Separator />
              <div>
                <h4 className="mb-2 text-sm font-semibold">All Versions</h4>
                <div className="space-y-2">
                  {service.versions.map((version) => (
                    <div
                      key={version.version}
                      className={`rounded-md border p-3 text-sm cursor-pointer transition-colors hover:bg-muted/50 ${
                        version.version === activeVersionString ? 'border-primary bg-primary/5' : ''
                      }`}
                      onClick={() => setSelectedVersion(version.version)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{version.version}</span>
                          {version.version === service.currentVersion && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              latest
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(version.releasedAt).toLocaleDateString()}
                        </span>
                      </div>
                      {version.releaseNotes && (
                        <p className="mt-1 text-xs text-muted-foreground truncate">
                          {version.releaseNotes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
