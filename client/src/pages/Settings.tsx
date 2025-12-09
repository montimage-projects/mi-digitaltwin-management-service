import { useQuery } from '@tanstack/react-query';
import { Info, Users, FolderTree, Server } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { categoriesApi } from '@/lib/api';
import { UserManagement } from './UserManagement';

export function Settings() {
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesApi.list,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure platform settings and preferences
        </p>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general" className="gap-2">
            <Info className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="categories" className="gap-2">
            <FolderTree className="h-4 w-4" />
            Categories
          </TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-6">
          <div className="rounded-lg border bg-background p-6">
            <h2 className="text-lg font-semibold mb-4">System Information</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Version</p>
                <p className="font-medium">1.0.0 (MVP)</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Environment</p>
                <Badge variant="outline">
                  {import.meta.env.MODE || 'development'}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">API URL</p>
                <p className="font-mono text-sm">{import.meta.env.VITE_API_URL || '/api'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Build Date</p>
                <p className="font-medium">{new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-background p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Server className="h-5 w-5" />
              MAESTRO Configuration
            </h2>
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Orchestrator URL</p>
                <p className="font-mono text-sm bg-muted px-3 py-2 rounded">
                  {import.meta.env.VITE_MAESTRO_URL || 'https://maestro.intact-project.eu'}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                MAESTRO URL is configured via environment variables and cannot be changed here.
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users">
          <UserManagement />
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-6">
          <div className="rounded-lg border bg-background p-6">
            <h2 className="text-lg font-semibold mb-4">Service Categories</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Categories are used to organize services in the repository. These are based on the D2.1 specification.
            </p>
            {categories.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No categories found</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {categories.map((category) => (
                  <div
                    key={category._id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/50"
                  >
                    <div>
                      <p className="font-medium">{category.name}</p>
                      {category.description && (
                        <p className="text-sm text-muted-foreground truncate max-w-[300px]">
                          {category.description}
                        </p>
                      )}
                    </div>
                    <Badge variant="secondary">{category.slug}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
