import { useQuery } from '@tanstack/react-query';
import { BarChart3, PieChart, TrendingUp, Activity, Loader2 } from 'lucide-react';
import { projectsApi, servicesApi, infrastructuresApi } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

export function Analytics() {
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  });

  const { data: servicesData, isLoading: servicesLoading } = useQuery({
    queryKey: ['services'],
    queryFn: () => servicesApi.list(),
  });

  const { data: infrastructures = [], isLoading: infraLoading } = useQuery({
    queryKey: ['infrastructures'],
    queryFn: infrastructuresApi.list,
  });

  const isLoading = projectsLoading || servicesLoading || infraLoading;

  // Calculate statistics
  const totalScenarios = projects.reduce((sum, p) => sum + p.scenarioCount, 0);
  const sectorDistribution = projects.reduce(
    (acc, p) => {
      acc[p.sector] = (acc[p.sector] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const servicesByCategory = servicesData?.services.reduce(
    (acc, s) => {
      const cat = s.categoryId?.name || 'Unknown';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const infraByType = infrastructures.reduce(
    (acc, i) => {
      acc[i.type] = (acc[i.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">View platform usage and statistics</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-background p-6">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Total Services</span>
          </div>
          <p className="text-3xl font-bold">{servicesData?.total || 0}</p>
        </div>

        <div className="rounded-lg border bg-background p-6">
          <div className="flex items-center gap-2 mb-2">
            <PieChart className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Total Projects</span>
          </div>
          <p className="text-3xl font-bold">{projects.length}</p>
        </div>

        <div className="rounded-lg border bg-background p-6">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Total Scenarios</span>
          </div>
          <p className="text-3xl font-bold">{totalScenarios}</p>
        </div>

        <div className="rounded-lg border bg-background p-6">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Infrastructures</span>
          </div>
          <p className="text-3xl font-bold">{infrastructures.length}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Projects by Sector */}
        <div className="rounded-lg border bg-background p-6">
          <h2 className="text-lg font-semibold mb-4">Projects by Sector</h2>
          {Object.keys(sectorDistribution).length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No data available</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(sectorDistribution).map(([sector, count]) => (
                <div key={sector} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{sector}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-muted rounded-full h-2">
                      <div
                        className="bg-primary rounded-full h-2"
                        style={{ width: `${(count / projects.length) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Services by Category */}
        <div className="rounded-lg border bg-background p-6">
          <h2 className="text-lg font-semibold mb-4">Services by Category</h2>
          {!servicesByCategory || Object.keys(servicesByCategory).length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No data available</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(servicesByCategory)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([category, count]) => (
                  <div key={category} className="flex items-center justify-between">
                    <span className="text-sm truncate max-w-[200px]">{category}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-muted rounded-full h-2">
                        <div
                          className="bg-blue-500 rounded-full h-2"
                          style={{
                            width: `${(count / (servicesData?.total || 1)) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Infrastructure by Type */}
        <div className="rounded-lg border bg-background p-6">
          <h2 className="text-lg font-semibold mb-4">Infrastructure by Type</h2>
          {Object.keys(infraByType).length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No infrastructure configured</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(infraByType).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <Badge variant="outline" className="capitalize">
                    {type}
                  </Badge>
                  <span className="text-lg font-bold">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Infrastructure Status */}
        <div className="rounded-lg border bg-background p-6">
          <h2 className="text-lg font-semibold mb-4">Infrastructure Status</h2>
          {infrastructures.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No infrastructure configured</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span>Active</span>
                </div>
                <span className="text-lg font-bold">
                  {infrastructures.filter((i) => i.status === 'active').length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-500" />
                  <span>Inactive</span>
                </div>
                <span className="text-lg font-bold">
                  {infrastructures.filter((i) => i.status === 'inactive').length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span>Error</span>
                </div>
                <span className="text-lg font-bold">
                  {infrastructures.filter((i) => i.status === 'error').length}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
