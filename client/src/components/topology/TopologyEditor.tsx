import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Code, Network, Columns, Save, RotateCcw } from 'lucide-react';
import { YamlEditor } from './YamlEditor';
import { TopologyCanvas } from './TopologyCanvas';
import { cn } from '@/lib/utils';

type ViewMode = 'code' | 'visual' | 'split';

interface ServiceOption {
  _id: string;
  shortName: string;
  title: string;
  description?: string;
  categoryId?: { name: string };
}

interface TopologyEditorProps {
  yaml: string;
  nodes: object[];
  edges: object[];
  onYamlChange: (yaml: string) => void;
  onNodesChange: (nodes: object[]) => void;
  onEdgesChange: (edges: object[]) => void;
  onSave: () => void;
  services?: ServiceOption[];
  isSaving?: boolean;
  isDirty?: boolean;
}

export function TopologyEditor({
  yaml,
  nodes,
  edges,
  onYamlChange,
  onNodesChange,
  onEdgesChange,
  onSave,
  services = [],
  isSaving = false,
  isDirty = false,
}: TopologyEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split');

  const handleReset = useCallback(() => {
    // Reset to empty topology
    onYamlChange('');
    onNodesChange([]);
    onEdgesChange([]);
  }, [onYamlChange, onNodesChange, onEdgesChange]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border bg-background p-1">
            <Button
              variant={viewMode === 'code' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('code')}
              className="h-7 px-2"
            >
              <Code className="h-4 w-4 mr-1" />
              Code
            </Button>
            <Button
              variant={viewMode === 'visual' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('visual')}
              className="h-7 px-2"
            >
              <Network className="h-4 w-4 mr-1" />
              Visual
            </Button>
            <Button
              variant={viewMode === 'split' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('split')}
              className="h-7 px-2"
            >
              <Columns className="h-4 w-4 mr-1" />
              Split
            </Button>
          </div>
          {isDirty && (
            <Badge variant="outline" className="text-yellow-600 border-yellow-600">
              Unsaved changes
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={isSaving}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
          <Button size="sm" onClick={onSave} disabled={isSaving || !isDirty}>
            <Save className="h-4 w-4 mr-1" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 min-h-0">
        {viewMode === 'code' && (
          <div className="h-full">
            <YamlEditor value={yaml} onChange={onYamlChange} />
          </div>
        )}

        {viewMode === 'visual' && (
          <div className="h-full">
            <TopologyCanvas
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              services={services}
            />
          </div>
        )}

        {viewMode === 'split' && (
          <div className="flex h-full">
            <div className={cn('h-full border-r', 'w-1/2')}>
              <YamlEditor value={yaml} onChange={onYamlChange} />
            </div>
            <div className={cn('h-full', 'w-1/2')}>
              <TopologyCanvas
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                services={services}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
