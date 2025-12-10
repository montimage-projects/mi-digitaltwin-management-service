import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus } from 'lucide-react';
import { projectsApi, type Project } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProjectTable } from '@/components/projects/ProjectTable';

export function Projects() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState<string>('');

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  });

  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      !search ||
      project.shortName.toLowerCase().includes(search.toLowerCase()) ||
      project.title.toLowerCase().includes(search.toLowerCase());

    const matchesSector =
      sectorFilter === 'all' || !sectorFilter || project.sector === sectorFilter;

    return matchesSearch && matchesSector;
  });

  const handleRowClick = (project: Project) => {
    navigate(`/projects/${project._id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Digital Twin Projects</h1>
          <p className="text-muted-foreground">Create and manage Digital Twin projects</p>
        </div>
        <Button onClick={() => navigate('/projects/add')}>
          <Plus className="mr-2 h-4 w-4" />
          Add Project
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={sectorFilter} onValueChange={setSectorFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Sectors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sectors</SelectItem>
            <SelectItem value="Telecommunications">Telecommunications</SelectItem>
            <SelectItem value="Healthcare">Healthcare</SelectItem>
            <SelectItem value="Transportation">Transportation</SelectItem>
            <SelectItem value="Nuclear">Nuclear</SelectItem>
            <SelectItem value="Cross-Sector">Cross-Sector</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Projects Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{filteredProjects.length} projects</span>
        </div>
        <ProjectTable
          projects={filteredProjects}
          isLoading={isLoading}
          onRowClick={handleRowClick}
        />
      </div>
    </div>
  );
}
