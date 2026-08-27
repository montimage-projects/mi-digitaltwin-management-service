import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Copy, Trash2 } from 'lucide-react';

export interface VersionItem {
  version: string;
  dockerImage: string;
  releaseNotes?: string;
}

export interface VersionsEditorProps {
  value: VersionItem[];
  onChange: (versions: VersionItem[]) => void;
}

export function VersionsEditor({ value, onChange }: VersionsEditorProps) {
  const [newVersion, setNewVersion] = useState('');
  const [newDockerImage, setNewDockerImage] = useState('');
  const [newReleaseNotes, setNewReleaseNotes] = useState('');

  const handleAddVersion = () => {
    const versionTrimmed = newVersion.trim();
    const dockerTrimmed = newDockerImage.trim();

    if (versionTrimmed && dockerTrimmed) {
      const newVersionItem: VersionItem = {
        version: versionTrimmed,
        dockerImage: dockerTrimmed,
        releaseNotes: newReleaseNotes.trim() || undefined,
      };
      onChange([newVersionItem, ...value]);
      setNewVersion('');
      setNewDockerImage('');
      setNewReleaseNotes('');
    }
  };

  const removeVersion = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div>
        <Label>Versions & Docker Images</Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          Release versions with their Docker image URLs
        </p>
      </div>
      <div className="space-y-3">
        {value.map((ver, index) => (
          <div key={index} className="border rounded-lg p-3 space-y-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="font-mono">
                v{ver.version}
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => removeVersion(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-background px-2 py-1.5 rounded border font-mono truncate">
                {ver.dockerImage}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(ver.dockerImage);
                }}
                title="Copy Docker image URL"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            {ver.releaseNotes && (
              <p className="text-xs text-muted-foreground">{ver.releaseNotes}</p>
            )}
          </div>
        ))}
      </div>
      {/* Add new version */}
      <div className="border rounded-lg p-3 space-y-3 border-dashed">
        <p className="text-xs font-medium text-muted-foreground">Add new version</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="version-input" className="text-xs">
              Version *
            </Label>
            <Input
              id="version-input"
              placeholder="e.g., 1.0.0"
              value={newVersion}
              onChange={(e) => setNewVersion(e.target.value)}
              className="h-8 text-sm font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="docker-image-input" className="text-xs">
              Docker Image URL *
            </Label>
            <Input
              id="docker-image-input"
              placeholder="e.g., registry.example.com/image:v1.0.0"
              value={newDockerImage}
              onChange={(e) => setNewDockerImage(e.target.value)}
              className="h-8 text-sm font-mono"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="release-notes-input" className="text-xs">
            Release Notes
          </Label>
          <Input
            id="release-notes-input"
            placeholder="e.g., Initial release, Bug fixes, New features..."
            value={newReleaseNotes}
            onChange={(e) => setNewReleaseNotes(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleAddVersion}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Version
        </Button>
      </div>
    </div>
  );
}
