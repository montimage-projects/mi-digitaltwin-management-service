import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, MoreHorizontal, Layers } from 'lucide-react';
import { projectsApi, type Project } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ErrorState } from '@/components/ui/error-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';

interface ProjectTableProps {
  projects: Project[];
  isLoading: boolean;
  onRowClick: (project: Project) => void;
}

const sectorColors: Record<string, string> = {
  Telecommunications: 'bg-blue-100 text-blue-800',
  Healthcare: 'bg-green-100 text-green-800',
  Transportation: 'bg-yellow-100 text-yellow-800',
  Nuclear: 'bg-red-100 text-red-800',
  'Cross-Sector': 'bg-purple-100 text-purple-800',
};

export function ProjectTable({ projects, isLoading, onRowClick }: ProjectTableProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const deleteMutation = useMutation({
    mutationFn: projectsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project deleted successfully');
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete project: ${error.message}`);
    },
  });

  const handleEdit = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    navigate(`/projects/${project._id}/edit`);
  };

  const handleDelete = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setProjectToDelete(project);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (projectToDelete) {
      deleteMutation.mutate(projectToDelete._id);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-md border">
        <table className="w-full">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium">Short Name</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Title</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Sector</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Leader</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Partners</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Scenarios</th>
              <th className="w-12 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((i) => (
              <tr key={i} className="border-b">
                <td className="px-4 py-3">
                  <Skeleton className="h-5 w-24" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-5 w-48" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-5 w-28" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-5 w-16" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-5 w-12" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-5 w-8" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-5 w-8" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (projects.length === 0 && !isLoading) {
    return (
      <div className="rounded-md border p-8 text-center">
        <p className="text-muted-foreground">No projects found</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <table className="w-full">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium">Short Name</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Title</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Sector</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Leader</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Partners</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Scenarios</th>
            <th className="w-12 px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr
              key={project._id}
              className="cursor-pointer border-b transition-colors hover:bg-muted/50"
              onClick={() => onRowClick(project)}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">{project.shortName}</span>
                  {project.isComposite && (
                    <span title="Composite Project">
                      <Layers className="h-4 w-4 text-muted-foreground" />
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-sm">{project.title}</td>
              <td className="px-4 py-3">
                <Badge className={sectorColors[project.sector] || ''} variant="secondary">
                  {project.sector}
                </Badge>
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">{project.leader}</td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {project.involvedPartners.length}
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">{project.scenarioCount}</td>
              <td className="px-4 py-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e: React.MouseEvent) => handleEdit(e, project)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e: React.MouseEvent) => handleDelete(e, project)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Project"
        description={`Are you sure you want to delete "${projectToDelete?.shortName}"? This action cannot be undone.`}
        confirmText="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export function ProjectTableWithState({
  projects,
  isLoading,
  error,
  onRetry,
  onRowClick,
}: {
  projects: Project[];
  isLoading: boolean;
  error: Error | string | null;
  onRetry?: () => void;
  onRowClick: (project: Project) => void;
}) {
  if (isLoading) {
    return <ProjectTable projects={projects} isLoading={true} onRowClick={onRowClick} />;
  }
  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }
  return <ProjectTable projects={projects} isLoading={false} onRowClick={onRowClick} />;
}
