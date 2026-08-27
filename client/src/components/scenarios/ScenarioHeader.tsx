import { useCallback, useState } from 'react';
import { ArrowLeft, Pencil, Play, FileDown, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { Scenario } from '@/lib/api';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ScenarioHeaderProps {
  scenario: Scenario;
  selectedInfrastructure: string | null;
  onDeploy: () => void;
  onEdit: () => void;
  onNavigateProject: () => void;
}

export function ScenarioHeader({
  scenario,
  selectedInfrastructure,
  onDeploy,
  onEdit,
  onNavigateProject,
}: ScenarioHeaderProps) {
  const [exporting, setExporting] = useState(false);

  const handleExportPdf = useCallback(async () => {
    try {
      setExporting(true);
      const { exportScenarioToPdf } = await import('@/lib/pdf-export');
      const project =
        scenario.projectId && typeof scenario.projectId === 'object' ? scenario.projectId : null;
      await exportScenarioToPdf({
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
    } catch {
      toast.error('Failed to generate PDF report');
    } finally {
      setExporting(false);
    }
  }, [scenario]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onNavigateProject}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{scenario.title}</h1>
          {scenario.projectId && typeof scenario.projectId === 'object' && (
            <p className="text-muted-foreground">
              {(scenario.projectId as { shortName?: string }).shortName} -{' '}
              {(scenario.projectId as { title?: string }).title}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={handleExportPdf} disabled={exporting}>
          {exporting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <FileDown className="mr-2 h-4 w-4" />
              Export PDF
            </>
          )}
        </Button>
        <Button variant="outline" onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit Details
        </Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                disabled={!selectedInfrastructure}
                onClick={onDeploy}
                title="Deploy scenario to target infrastructure"
              >
                <Play className="mr-2 h-4 w-4" />
                Deploy
              </Button>
            </TooltipTrigger>
            {!selectedInfrastructure && (
              <TooltipContent className="max-w-[250px]">
                <p className="text-xs">
                  <AlertCircle className="mr-1 inline h-3 w-3" />
                  Select a target infrastructure before deploying a scenario.
                </p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
