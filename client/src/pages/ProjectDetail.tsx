import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ArrowLeft, Loader2, Pencil, Plus, Layers } from 'lucide-react';
import { projectsApi, scenariosApi } from '@/lib/api';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScenarioTableWithState } from '@/components/scenarios/ScenarioTable';

const sectorColors: Record<string, string> = {
  Telecommunications: 'bg-blue-100 text-blue-800',
  Healthcare: 'bg-green-100 text-green-800',
  Transportation: 'bg-yellow-100 text-yellow-800',
  Nuclear: 'bg-red-100 text-red-800',
  'Cross-Sector': 'bg-purple-100 text-purple-800',
};

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tabs, closeTab } = useWorkspaceStore();

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id!),
    enabled: !!id,
  });

  const { data: scenarios = [], isLoading: scenariosLoading } = useQuery({
    queryKey: ['scenarios', id],
    queryFn: () => scenariosApi.list(id!),
    enabled: !!id,
  });

  // Close scenarios from other projects when switching projects
  useEffect(() => {
    if (id) {
      tabs.forEach((tab) => {
        if (tab.type === 'scenario' && tab.projectId && tab.projectId !== id) {
          closeTab(tab.id);
        }
      });
    }
  }, [id, tabs, closeTab]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Project not found</p>
        <Button variant="link" onClick={() => navigate('/projects')}>
          Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/projects')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{project.shortName}</h1>
              {project.isComposite && (
                <span title="Composite Project">
                  <Layers className="h-5 w-5 text-muted-foreground" />
                </span>
              )}
              <Badge className={sectorColors[project.sector]} variant="secondary">
                {project.sector}
              </Badge>
            </div>
            <p className="text-muted-foreground">{project.title}</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate(`/projects/${id}/edit`)}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit Project
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Project Info */}
        <div className="col-span-2 space-y-6">
          <div className="rounded-lg border bg-background p-6">
            <h2 className="mb-4 text-lg font-semibold">Project Details</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Leader</p>
                  <p className="font-medium">{project.leader}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <p className="font-medium">{project.isComposite ? 'Composite' : 'Atomic'}</p>
                </div>
              </div>

              {project.description && (
                <div>
                  <p className="text-sm text-muted-foreground">Description</p>
                  <p className="text-sm">{project.description}</p>
                </div>
              )}

              {project.involvedPartners.length > 0 && (
                <div>
                  <p className="mb-2 text-sm text-muted-foreground">Involved Partners</p>
                  <div className="flex flex-wrap gap-1">
                    {project.involvedPartners.map((partner) => (
                      <Badge key={partner} variant="outline">
                        {partner}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {project.isComposite && project.atomicProjectIds.length > 0 && (
                <div>
                  <p className="mb-2 text-sm text-muted-foreground">Composed From</p>
                  <div className="space-y-2">
                    {project.atomicProjectIds.map((p) => (
                      <div
                        key={p._id}
                        className="flex items-center justify-between rounded-md border p-2"
                      >
                        <div>
                          <span className="font-mono text-sm font-medium">{p.shortName}</span>
                          <span className="ml-2 text-sm text-muted-foreground">{p.title}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {p.sector}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Scenarios Section */}
          <div className="rounded-lg border bg-background p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Scenarios</h2>
              <Button size="sm" onClick={() => navigate(`/projects/${id}/scenarios/add`)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Scenario
              </Button>
            </div>
            <ScenarioTableWithState
              scenarios={scenarios}
              projectId={id!}
              isLoading={scenariosLoading}
              error={null}
              onRetry={() => window.location.reload()}
            />
          </div>
        </div>

        {/* Sidebar Stats */}
        <div className="space-y-4">
          <div className="rounded-lg border bg-background p-6">
            <h3 className="mb-4 font-semibold">Statistics</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Scenarios</span>
                <span className="font-medium">{project.scenarioCount}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Partners</span>
                <span className="font-medium">{project.involvedPartners.length}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium text-sm">
                  {new Date(project.createdAt).toLocaleDateString()}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span className="font-medium text-sm">
                  {new Date(project.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
