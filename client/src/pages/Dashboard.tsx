import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Server, FolderKanban, Activity, Cloud, ArrowRight, Loader2 } from 'lucide-react';
import { servicesApi, projectsApi, infrastructuresApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function Dashboard() {
  const navigate = useNavigate();

  const { data: servicesData, isLoading: servicesLoading } = useQuery({
    queryKey: ['services', { limit: 5 }],
    queryFn: () => servicesApi.list({ limit: 5 }),
  });

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  });

  const { data: infrastructures = [], isLoading: infraLoading } = useQuery({
    queryKey: ['infrastructures'],
    queryFn: infrastructuresApi.list,
  });

  const totalServices = servicesData?.total || 0;
  const totalProjects = projects.length;
  const totalInfrastructures = infrastructures.length;
  const activeInfrastructures = infrastructures.filter((i) => i.status === 'active').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to the INTACT Digital Twin Management Platform
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div
          className="rounded-lg border bg-background p-6 cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => navigate('/services')}
        >
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-blue-100 p-3">
              <Server className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Services</p>
              {servicesLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <p className="text-2xl font-bold">{totalServices}</p>
              )}
            </div>
          </div>
        </div>

        <div
          className="rounded-lg border bg-background p-6 cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => navigate('/projects')}
        >
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-green-100 p-3">
              <FolderKanban className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Projects</p>
              {projectsLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <p className="text-2xl font-bold">{totalProjects}</p>
              )}
            </div>
          </div>
        </div>

        <div
          className="rounded-lg border bg-background p-6 cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => navigate('/infrastructure')}
        >
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-purple-100 p-3">
              <Cloud className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Infrastructures</p>
              {infraLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold">{totalInfrastructures}</p>
                  {activeInfrastructures > 0 && (
                    <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                      {activeInfrastructures} active
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-background p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-orange-100 p-3">
              <Activity className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Scenarios</p>
              {projectsLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <p className="text-2xl font-bold">
                  {projects.reduce((sum, p) => sum + p.scenarioCount, 0)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Projects */}
        <div className="rounded-lg border bg-background p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Recent Projects</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}>
              View all
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          {projectsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No projects yet</p>
              <Button onClick={() => navigate('/projects/add')}>Create your first project</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.slice(0, 5).map((project) => (
                <div
                  key={project._id}
                  className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/projects/${project._id}`)}
                >
                  <div>
                    <p className="font-medium">{project.shortName}</p>
                    <p className="text-sm text-muted-foreground">{project.title}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{project.sector}</Badge>
                    <span className="text-sm text-muted-foreground">
                      {project.scenarioCount} scenarios
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Getting Started */}
        <div className="rounded-lg border bg-background p-6">
          <h2 className="mb-4 text-lg font-semibold">Getting Started</h2>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-1 mt-0.5">
                <span className="text-xs font-bold text-primary w-4 h-4 flex items-center justify-center">
                  1
                </span>
              </div>
              <div>
                <p className="font-medium">Browse the Service Repository</p>
                <p className="text-sm text-muted-foreground">
                  Explore available cybersecurity tools from the INTACT Toolbox
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-1 mt-0.5">
                <span className="text-xs font-bold text-primary w-4 h-4 flex items-center justify-center">
                  2
                </span>
              </div>
              <div>
                <p className="font-medium">Create a Digital Twin Project</p>
                <p className="text-sm text-muted-foreground">
                  Set up a project for your sector (Telecom, Healthcare, etc.)
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-1 mt-0.5">
                <span className="text-xs font-bold text-primary w-4 h-4 flex items-center justify-center">
                  3
                </span>
              </div>
              <div>
                <p className="font-medium">Design Scenarios</p>
                <p className="text-sm text-muted-foreground">
                  Create topologies combining services using the visual or YAML editor
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-1 mt-0.5">
                <span className="text-xs font-bold text-primary w-4 h-4 flex items-center justify-center">
                  4
                </span>
              </div>
              <div>
                <p className="font-medium">Configure Infrastructure</p>
                <p className="text-sm text-muted-foreground">
                  Connect Kubernetes clusters or Docker environments
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-1 mt-0.5">
                <span className="text-xs font-bold text-primary w-4 h-4 flex items-center justify-center">
                  5
                </span>
              </div>
              <div>
                <p className="font-medium">Execute & Document</p>
                <p className="text-sm text-muted-foreground">
                  Ask the AI Agent to explore services, plan deployments, and export reports
                </p>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
