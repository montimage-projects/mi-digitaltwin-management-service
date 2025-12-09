import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, MoreHorizontal, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { servicesApi, type Service } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type SortColumn = 'shortName' | 'title' | 'category' | 'provider';
type SortDirection = 'asc' | 'desc';

interface ServiceTableProps {
  services: Service[];
  isLoading: boolean;
  onRowClick: (service: Service) => void;
}

export function ServiceTable({ services, isLoading, onRowClick }: ServiceTableProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedServices = useMemo(() => {
    if (!sortColumn) return services;

    return [...services].sort((a, b) => {
      let aVal: string;
      let bVal: string;

      switch (sortColumn) {
        case 'shortName':
          aVal = a.shortName || '';
          bVal = b.shortName || '';
          break;
        case 'title':
          aVal = a.title || '';
          bVal = b.title || '';
          break;
        case 'category':
          aVal = a.categoryId?.name || '';
          bVal = b.categoryId?.name || '';
          break;
        case 'provider':
          aVal = a.provider || '';
          bVal = b.provider || '';
          break;
        default:
          return 0;
      }

      const comparison = aVal.localeCompare(bVal, undefined, { sensitivity: 'base' });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [services, sortColumn, sortDirection]);

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  const deleteMutation = useMutation({
    mutationFn: servicesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });

  const handleEdit = (e: React.MouseEvent, service: Service) => {
    e.stopPropagation();
    navigate(`/services/${service._id}/edit`);
  };

  const handleDelete = (e: React.MouseEvent, service: Service) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete ${service.shortName}?`)) {
      deleteMutation.mutate(service._id);
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
              <th className="px-4 py-3 text-left text-sm font-medium">Category</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Provider</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Version</th>
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
                  <Skeleton className="h-5 w-32" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-5 w-16" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-5 w-12" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center">
        <p className="text-muted-foreground">No services found</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <table className="w-full">
        <thead className="border-b bg-muted/50">
          <tr>
            <th
              className="cursor-pointer px-4 py-3 text-left text-sm font-medium hover:bg-muted/80"
              onClick={() => handleSort('shortName')}
            >
              <span className="flex items-center">
                Short Name
                <SortIcon column="shortName" />
              </span>
            </th>
            <th
              className="cursor-pointer px-4 py-3 text-left text-sm font-medium hover:bg-muted/80"
              onClick={() => handleSort('title')}
            >
              <span className="flex items-center">
                Title
                <SortIcon column="title" />
              </span>
            </th>
            <th
              className="cursor-pointer px-4 py-3 text-left text-sm font-medium hover:bg-muted/80"
              onClick={() => handleSort('category')}
            >
              <span className="flex items-center">
                Category
                <SortIcon column="category" />
              </span>
            </th>
            <th
              className="cursor-pointer px-4 py-3 text-left text-sm font-medium hover:bg-muted/80"
              onClick={() => handleSort('provider')}
            >
              <span className="flex items-center">
                Provider
                <SortIcon column="provider" />
              </span>
            </th>
            <th className="px-4 py-3 text-left text-sm font-medium">Version</th>
            <th className="w-12 px-4 py-3 text-left text-sm font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {sortedServices.map((service) => (
            <tr
              key={service._id}
              className="cursor-pointer border-b transition-colors hover:bg-muted/50"
              onClick={() => onRowClick(service)}
            >
              <td className="px-4 py-3 font-mono text-sm font-medium">
                {service.shortName}
              </td>
              <td className="px-4 py-3 text-sm">{service.title}</td>
              <td className="px-4 py-3">
                <Badge variant="secondary" className="font-normal">
                  {service.categoryId?.name}
                </Badge>
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">{service.provider}</td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {service.currentVersion}
              </td>
              <td className="px-4 py-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => handleEdit(e, service)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => handleDelete(e, service)}
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
    </div>
  );
}
