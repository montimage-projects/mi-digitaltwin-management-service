import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Play,
  FileDown,
  PanelRightClose,
  PanelRightOpen,
  X,
  Settings2,
  Rocket,
} from 'lucide-react';
import { scenariosApi, servicesApi, infrastructuresApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TopologyEditor } from '@/components/topology/TopologyEditor';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { ExecutionPanel } from '@/components/execution/ExecutionPanel';
import { ExecutionConsole } from '@/components/execution/ExecutionConsole';
import { ScenarioEditorGuidelinesModal } from '@/components/scenarios/ScenarioEditorGuidelinesModal';
import { RightSidebar } from '@/components/scenarios/ScenarioRightSidebar';
import { exportScenarioToPdf } from '@/lib/pdf-export';
import { useScenarioTopology } from '@/hooks/useScenarioTopology';
import { useWorkspaceTabSync } from '@/hooks/useWorkspaceTabSync';
import { toast } from 'sonner';

export function ScenarioDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { data: scenario, isLoading } = useQuery({
    queryKey: ['scenario', id],
    queryFn: () => scenariosApi.get(id!),
    enabled: !!id,
  });

  const { data: infrastructuresData = [] } = useQuery({
    queryKey: ['infrastructures'],
    queryFn: infrastructuresApi.list,
  });

  const { data: servicesData } = useQuery({
    queryKey: ['services', 'all'],
    queryFn: () => servicesApi.list({ limit: 1000 }),
  });
  const services = servicesData?.services || [];

  // Infrastructure ID from scenario
  const infra = scenario?.infrastructureId;
  const selectedInfrastructure =
    infra && typeof infra === 'object'
      ? ((infra as { _id?: string })._id ?? null)
      : typeof infra === 'string'
        ? infra
        : null;

  const handleInfrastructureChange = useCallback(
    (infrastructureId: string | null) => {
      scenariosApi.update(id!, { infrastructureId: infrastructureId || undefined });
    },
    [id]
  );

  const topology = useScenarioTopology({
    scenarioId: id!,
    scenario,
    selectedInfrastructure,
    onInfrastructureChange: handleInfrastructureChange,
  });

  const { handleTabClick } = useWorkspaceTabSync({
    scenarioId: id!,
    scenario,
    isDirty: topology.isDirty,
  });

  // UI state
  const [executionPanelOpen, setExecutionPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('editor');
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);

  useEffect(() => {
    const deployParam = searchParams.get('deploy');
    const executeParam = searchParams.get('execute');
    if (
      (deployParam === 'true' || executeParam === 'true') &&
      !executionPanelOpen &&
      selectedInfrastructure
    ) {
      setExecutionPanelOpen(true);
    }
  }, [searchParams, executionPanelOpen, selectedInfrastructure]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!scenario) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Scenario not found</p>
        <Button variant="link" onClick={() => navigate('/projects')}>
          Back to Projects
        </Button>
      </div>
    );
  }

  const project =
    scenario.projectId && typeof scenario.projectId === 'object' ? scenario.projectId : null;
  const infrastructure =
    scenario.infrastructureId && typeof scenario.infrastructureId === 'object'
      ? scenario.infrastructureId
      : null;

  const executions = scenario.executions ?? [];
  const infraName =
    selectedInfrastructure && typeof selectedInfrastructure === 'string'
      ? infrastructuresData.find((i) => i._id === selectedInfrastructure)?.name
      : (infrastructure as { name?: string } | null)?.name;

  const handleNavProject = useCallback(() => {
    const projectId =
      project && typeof project === 'object' ? (project as { _id?: string })._id : undefined;
    navigate(projectId ? `/projects/${projectId}` : '/projects');
  }, [navigate, project]);

  const handleExportPdf = useCallback(() => {
    exportScenarioToPdf({
      scenario,
      project: project
        ? {
            shortName: (project as { shortName?: string }).shortName ?? '',
            title: (project as { title?: string }).title ?? '',
            sector: (project as { sector?: string }).sector ?? '',
            leader: 'N/A',
            involvedPartners: [],
          }
        : undefined,
    });
    toast.success('PDF report generated');
  }, [scenario, project]);

  return (
    <div className="space-y-4 h-full">
      <WorkspaceTabs onTabClick={handleTabClick} />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleNavProject}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{scenario.title}</h1>
            {project && (
              <p className="text-muted-foreground">
                {(project as { shortName?: string }).shortName} -{' '}
                {(project as { title?: string }).title}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleExportPdf}>
            <FileDown className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
          <Button variant="outline" onClick={() => navigate(`/scenarios/${id}/edit`)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit Details
          </Button>
          <Button
            disabled={!selectedInfrastructure}
            onClick={() => setExecutionPanelOpen(true)}
            title="Deploy scenario to target infrastructure"
          >
            <Play className="mr-2 h-4 w-4" />
            Deploy
          </Button>
        </div>
      </div>

      {/* Execution Panel */}
      <ExecutionPanel
        scenarioId={id!}
        scenarioTitle={scenario.title}
        infrastructureName={infraName}
        executions={executions}
        open={executionPanelOpen}
        onOpenChange={setExecutionPanelOpen}
        onExecutionStart={topology.handleExecutionStart}
      />

      <div className="flex gap-4" style={{ height: 'calc(100vh - 200px)' }}>
        {/* Main Content */}
        <div className="flex-1 min-w-0 transition-all duration-300">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <div className="rounded-t-lg border border-b-0 bg-background px-2">
              <TabsList className="h-10 bg-transparent">
                <TabsTrigger value="editor" className="gap-2 data-[state=active]:bg-muted">
                  <Settings2 className="h-4 w-4" />
                  Editor
                </TabsTrigger>
                {topology.activeExecution && (
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
                        topology.handleCloseExecution();
                        setActiveTab('editor');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          topology.handleCloseExecution();
                          setActiveTab('editor');
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
                <TopologyEditor
                  yaml={topology.yaml}
                  nodes={topology.nodes}
                  edges={topology.edges}
                  onYamlChange={topology.handleYamlChange}
                  onNodesChange={topology.handleNodesChange}
                  onEdgesChange={topology.handleEdgesChange}
                  onSave={topology.handleSave}
                  services={services}
                  isSaving={topology.isSaving}
                  isDirty={topology.isDirty}
                  infrastructures={infrastructuresData}
                  selectedInfrastructure={selectedInfrastructure}
                  onInfrastructureChange={handleInfrastructureChange}
                  onValidate={topology.handleValidate}
                  onHelpClick={() => setGuidelinesOpen(true)}
                />
              </TabsContent>

              {topology.activeExecution && (
                <TabsContent value="execution" className="h-full m-0 data-[state=inactive]:hidden">
                  <ExecutionConsole
                    scenarioId={id!}
                    executionId={topology.activeExecution.executionId}
                    namespace={topology.activeExecution.namespace}
                    services={topology.activeExecution.services}
                    onClose={() => {
                      topology.handleCloseExecution();
                      setActiveTab('editor');
                    }}
                  />
                </TabsContent>
              )}
            </div>
          </Tabs>
        </div>

        {/* Toggle Right Panel Button */}
        <div className="relative flex items-start pt-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
            title={rightPanelCollapsed ? 'Show info panel' : 'Hide info panel'}
          >
            {rightPanelCollapsed ? (
              <PanelRightOpen className="h-4 w-4" />
            ) : (
              <PanelRightClose className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Right Sidebar */}
        <div
          className={`transition-all duration-300 overflow-hidden ${rightPanelCollapsed ? 'w-0 opacity-0' : 'w-72 opacity-100'}`}
        >
          <RightSidebar
            infrastructure={infrastructure}
            selectedInfrastructure={selectedInfrastructure}
            infrastructuresData={infrastructuresData}
            description={scenario.description as string}
            executions={executions}
          />
        </div>
      </div>

      <ScenarioEditorGuidelinesModal open={guidelinesOpen} onOpenChange={setGuidelinesOpen} />
    </div>
  );
}
