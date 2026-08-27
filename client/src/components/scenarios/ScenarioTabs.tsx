import { useCallback } from 'react';
import { Settings2, Rocket, X } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TopologyEditor } from '@/components/topology/TopologyEditor';
import { ExecutionConsole } from '@/components/execution/ExecutionConsole';
import type { Infrastructure } from '@/lib/api';
import type { DeployedServiceResult } from '@/lib/api';

interface ServiceOption {
  _id: string;
  shortName: string;
  title: string;
  description?: string;
  categoryId?: { name: string };
}

interface ScenarioTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  activeExecution: {
    executionId: string;
    namespace: string;
    services: DeployedServiceResult[];
  } | null;
  scenarioId: string;
  topologyProps: {
    yaml: string;
    nodes: object[];
    edges: object[];
    onYamlChange: (yaml: string) => void;
    onNodesChange: (nodes: object[]) => void;
    onEdgesChange: (edges: object[]) => void;
    onSave: () => void;
    services?: ServiceOption[];
    isSaving?: boolean;
    isDirty?: boolean;
    infrastructures?: Infrastructure[];
    selectedInfrastructure?: string | null;
    onInfrastructureChange?: (id: string | null) => void;
    onValidate?: () => void;
    onHelpClick?: () => void;
  };
  onCloseExecution: () => void;
}

export function ScenarioTabs({
  activeTab,
  onTabChange,
  activeExecution,
  scenarioId,
  topologyProps,
  onCloseExecution,
}: ScenarioTabsProps) {
  const handleCloseExecution = useCallback(() => {
    onCloseExecution();
    onTabChange('editor');
  }, [onCloseExecution, onTabChange]);

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="h-full flex flex-col">
      <div className="rounded-t-lg border border-b-0 bg-background px-2">
        <TabsList className="h-10 bg-transparent">
          <TabsTrigger value="editor" className="gap-2 data-[state=active]:bg-muted">
            <Settings2 className="h-4 w-4" />
            Editor
          </TabsTrigger>
          {activeExecution && (
            <TabsTrigger value="execution" className="gap-2 data-[state=active]:bg-muted">
              <Rocket className="h-4 w-4 text-primary" />
              Execution
              <span
                role="button"
                tabIndex={0}
                aria-label="Close execution tab"
                className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-destructive/20 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseExecution();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCloseExecution();
                  }
                }}
              >
                <X className="h-3.5 w-3.5" />
              </span>
            </TabsTrigger>
          )}
        </TabsList>
      </div>

      <div className="flex-1 rounded-b-lg border bg-background overflow-hidden">
        <TabsContent value="editor" className="h-full m-0 data-[state=inactive]:hidden">
          <TopologyEditor {...topologyProps} />
        </TabsContent>

        {activeExecution && (
          <TabsContent value="execution" className="h-full m-0 data-[state=inactive]:hidden">
            <ExecutionConsole
              scenarioId={scenarioId}
              executionId={activeExecution.executionId}
              namespace={activeExecution.namespace}
              services={activeExecution.services}
              onClose={handleCloseExecution}
            />
          </TabsContent>
        )}
      </div>
    </Tabs>
  );
}
