import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Pencil, Play, Server, FileDown } from 'lucide-react';
import { scenariosApi, servicesApi, CreateScenarioData } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TopologyEditor } from '@/components/topology/TopologyEditor';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { ExecutionPanel } from '@/components/execution/ExecutionPanel';
import { useWorkspaceStore } from '@/store/workspace-store';
import { exportScenarioToPdf } from '@/lib/pdf-export';
import { toast } from 'sonner';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500',
  running: 'bg-blue-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
};

export function ScenarioDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { openTab, updateTab, tabs } = useWorkspaceStore();

  const { data: scenario, isLoading } = useQuery({
    queryKey: ['scenario', id],
    queryFn: () => scenariosApi.get(id!),
    enabled: !!id,
  });

  // Fetch services for topology canvas
  const { data: servicesData } = useQuery({
    queryKey: ['services'],
    queryFn: () => servicesApi.list(),
  });
  const services = servicesData?.services || [];

  // Local state for topology editing
  const [yaml, setYaml] = useState('');
  const [nodes, setNodes] = useState<object[]>([]);
  const [edges, setEdges] = useState<object[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [executionPanelOpen, setExecutionPanelOpen] = useState(false);

  // Add scenario to workspace tabs when loaded
  useEffect(() => {
    if (scenario && id) {
      const projectId =
        scenario.projectId && typeof scenario.projectId === 'object'
          ? scenario.projectId._id
          : undefined;
      openTab({
        type: 'scenario',
        scenarioId: id,
        title: scenario.title,
        projectId,
      });
    }
  }, [scenario, id, openTab]);

  // Update tab dirty state
  useEffect(() => {
    if (id && isDirty !== undefined) {
      const currentTab = tabs.find((t) => t.scenarioId === id);
      if (currentTab && currentTab.isDirty !== isDirty) {
        updateTab(currentTab.id, { isDirty });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, id]);

  // Initialize local state from scenario
  useEffect(() => {
    if (scenario) {
      setYaml(scenario.topology?.yaml || '');
      setNodes(scenario.topology?.nodes || []);
      setEdges(scenario.topology?.edges || []);
      setIsDirty(false);
    }
  }, [scenario]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<CreateScenarioData>) => scenariosApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenario', id] });
      toast.success('Topology saved successfully');
      setIsDirty(false);
    },
    onError: (error: Error) => {
      toast.error(`Failed to save topology: ${error.message}`);
    },
  });

  const handleYamlChange = useCallback((newYaml: string) => {
    setYaml(newYaml);
    setIsDirty(true);
  }, []);

  const handleNodesChange = useCallback((newNodes: object[]) => {
    setNodes(newNodes);
    setIsDirty(true);
  }, []);

  const handleEdgesChange = useCallback((newEdges: object[]) => {
    setEdges(newEdges);
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    updateMutation.mutate({
      topology: { yaml, nodes, edges },
    });
  }, [updateMutation, yaml, nodes, edges]);

  const handleTabClick = useCallback(
    (tab: { scenarioId: string }) => {
      if (tab.scenarioId !== id) {
        navigate(`/scenarios/${tab.scenarioId}`);
      }
    },
    [id, navigate]
  );

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

  return (
    <div className="space-y-4 h-full">
      {/* Workspace Tabs */}
      <WorkspaceTabs onTabClick={handleTabClick} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(project ? `/projects/${project._id}` : '/projects')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{scenario.title}</h1>
            {project && (
              <p className="text-muted-foreground">
                {project.shortName} - {project.title}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              exportScenarioToPdf({
                scenario,
                project: project
                  ? {
                      shortName: project.shortName,
                      title: project.title,
                      sector: project.sector,
                      leader: 'N/A',
                      involvedPartners: [],
                    }
                  : undefined,
              });
              toast.success('PDF report generated');
            }}
          >
            <FileDown className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
          <Button variant="outline" onClick={() => navigate(`/scenarios/${id}/edit`)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit Details
          </Button>
          <Button disabled={!infrastructure} onClick={() => setExecutionPanelOpen(true)}>
            <Play className="mr-2 h-4 w-4" />
            Execute
          </Button>
        </div>
      </div>

      {/* Execution Panel */}
      <ExecutionPanel
        scenarioId={id!}
        scenarioTitle={scenario.title}
        infrastructureName={infrastructure?.name}
        executions={scenario.executions}
        open={executionPanelOpen}
        onOpenChange={setExecutionPanelOpen}
      />

      <div className="grid grid-cols-4 gap-6" style={{ height: 'calc(100vh - 200px)' }}>
        {/* Main Content - Topology Editor */}
        <div className="col-span-3">
          <div className="rounded-lg border bg-background h-full overflow-hidden">
            <TopologyEditor
              yaml={yaml}
              nodes={nodes}
              edges={edges}
              onYamlChange={handleYamlChange}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onSave={handleSave}
              services={services}
              isSaving={updateMutation.isPending}
              isDirty={isDirty}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4 overflow-y-auto">
          {/* Infrastructure */}
          <div className="rounded-lg border bg-background p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Server className="h-4 w-4" />
              Infrastructure
            </h3>
            {infrastructure ? (
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">{infrastructure.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <Badge variant="outline">{infrastructure.type}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        infrastructure.status === 'active'
                          ? 'bg-green-500'
                          : infrastructure.status === 'error'
                            ? 'bg-red-500'
                            : 'bg-gray-500'
                      }`}
                    />
                    <span className="capitalize">{infrastructure.status}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No infrastructure assigned</p>
            )}
          </div>

          {/* Description */}
          {scenario.description && (
            <div className="rounded-lg border bg-background p-4">
              <h3 className="font-semibold mb-2">Description</h3>
              <p className="text-sm text-muted-foreground">{scenario.description}</p>
            </div>
          )}

          {/* Executions */}
          <div className="rounded-lg border bg-background p-4">
            <h3 className="font-semibold mb-3">Execution History</h3>
            {scenario.executions.length > 0 ? (
              <div className="space-y-2">
                {scenario.executions
                  .slice(-5)
                  .reverse()
                  .map((execution) => (
                    <div
                      key={execution._id}
                      className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${statusColors[execution.status]}`}
                        />
                        <span className="capitalize">{execution.status}</span>
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {new Date(execution.executedAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No executions yet</p>
            )}
          </div>

          {/* Timestamps */}
          <div className="rounded-lg border bg-background p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(scenario.createdAt).toLocaleDateString()}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span>{new Date(scenario.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
