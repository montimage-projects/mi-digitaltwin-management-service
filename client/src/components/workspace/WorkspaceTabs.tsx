import { X, FileText } from 'lucide-react';
import { useWorkspaceStore, WorkspaceTab } from '@/store/workspace-store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface WorkspaceTabsProps {
  onTabClick?: (tab: WorkspaceTab) => void;
}

export function WorkspaceTabs({ onTabClick }: WorkspaceTabsProps) {
  const { tabs, activeTabId, setActiveTab, closeTab } = useWorkspaceStore();

  if (tabs.length === 0) {
    return null;
  }

  const handleTabClick = (tab: WorkspaceTab) => {
    setActiveTab(tab.id);
    onTabClick?.(tab);
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closeTab(tabId);
  };

  return (
    <div className="flex items-center gap-1 border-b bg-muted/30 px-2 py-1 overflow-x-auto">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => handleTabClick(tab)}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-t-md cursor-pointer text-sm transition-colors',
            'hover:bg-muted/50',
            activeTabId === tab.id
              ? 'bg-background border border-b-0 text-foreground'
              : 'text-muted-foreground'
          )}
        >
          <FileText className="h-4 w-4" />
          <span className="max-w-[150px] truncate">{tab.title}</span>
          {tab.isDirty && <span className="w-2 h-2 rounded-full bg-yellow-500" />}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 p-1 hover:bg-muted"
                  onClick={(e) => handleCloseTab(e, tab.id)}
                  aria-label={`Close tab: ${tab.title}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Close tab</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ))}
    </div>
  );
}
