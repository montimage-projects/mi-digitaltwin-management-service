import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { scenariosApi, servicesApi, infrastructuresApi } from '@/lib/api';
import { useScenarioTopology } from '@/hooks/useScenarioTopology';
import { useWorkspaceTabSync } from '@/hooks/useWorkspaceTabSync';
import { ScenarioHeader } from '@/components/scenarios/ScenarioHeader';
import { ScenarioTabs } from '@/components/scenarios/ScenarioTabs';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { ExecutionPanel } from '@/components/execution/ExecutionPanel';
import { ScenarioEditorGuidelinesModal } from '@/components/scenarios/ScenarioEditorGuidelinesModal';
import { RightSidebar } from '@/components/scenarios/ScenarioRightSidebar';

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

  const [executionPanelOpen, setExecutionPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('editor');
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);

  // Extract project ID early so useCallback can be called before early returns
  const scenarioProjectId =
    scenario?.projectId && typeof scenario.projectId === 'object'
      ? (scenario.projectId as { _id?: string })._id
      : undefined;

  const handleNavProject = useCallback(() => {
    navigate(scenarioProjectId ? `/projects/${scenarioProjectId}` : '/projects');
  }, [navigate, scenarioProjectId]);

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
        <button className="text-sm underline" onClick={() => navigate('/projects')}>
          Back to Projects
        </button>
      </div>
    );
  }

  const infrastructure =
    scenario.infrastructureId && typeof scenario.infrastructureId === 'object'
      ? scenario.infrastructureId
      : null;
  const executions = scenario.executions ?? [];
  const infraName =
    selectedInfrastructure && typeof selectedInfrastructure === 'string'
      ? infrastructuresData.find((i) => i._id === selectedInfrastructure)?.name
      : (infrastructure as { name?: string } | null)?.name;

  return (
    <div className="space-y-4 h-full">
      <WorkspaceTabs onTabClick={handleTabClick} />
      <ScenarioHeader
        scenario={scenario}
        selectedInfrastructure={selectedInfrastructure}
        onDeploy={() => setExecutionPanelOpen(true)}
        onEdit={() => navigate(`/scenarios/${id}/edit`)}
        onNavigateProject={handleNavProject}
      />
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
        <div className="flex-1 min-w-0 transition-all duration-300">
          <ScenarioTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            activeExecution={topology.activeExecution}
            scenarioId={id!}
            topologyProps={{
              yaml: topology.yaml,
              nodes: topology.nodes,
              edges: topology.edges,
              onYamlChange: topology.handleYamlChange,
              onNodesChange: topology.handleNodesChange,
              onEdgesChange: topology.handleEdgesChange,
              onSave: topology.handleSave,
              services,
              isSaving: topology.isSaving,
              isDirty: topology.isDirty,
              infrastructures: infrastructuresData,
              selectedInfrastructure,
              onInfrastructureChange: handleInfrastructureChange,
              onValidate: topology.handleValidate,
              onHelpClick: () => setGuidelinesOpen(true),
            }}
            onCloseExecution={() => {
              topology.handleCloseExecution();
              setActiveTab('editor');
            }}
          />
        </div>
        <button
          className="relative flex items-start pt-2 h-8 w-8 rounded hover:bg-muted"
          onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
          title={rightPanelCollapsed ? 'Show info panel' : 'Hide info panel'}
        >
          {rightPanelCollapsed ? '◀' : '▶'}
        </button>
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
