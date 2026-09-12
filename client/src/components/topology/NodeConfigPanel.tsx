import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  effectiveArgs,
  effectiveConfigFiles,
  effectiveEnv,
  nodeConfigOf,
  pruneConfig,
  removeConfigFile,
  removeEnvOverride,
  upsertConfigFile,
  upsertEnvOverride,
  type CatalogDeployment,
  type ConfigurableNode,
  type EnvRow,
  type NodeConfig,
  type NodeConfigEnv,
} from '@/lib/node-config';

/**
 * Per-node config panel — task 3.3 of the Montimage attack→detect→respond
 * plan (docs/playbooks/montimage-attack-detect-respond-plan.md).
 *
 * Edits the overrides persisted at `node.data.config`: `env` (merged by name
 * over the catalog `deployment.env` at deploy time), `args` (replaces the
 * catalog list wholesale) and `configFiles` (per-file content overrides the
 * catalog's, keyed by `mountPath`). Rows show catalog defaults until edited;
 * every change is written through `onConfigChange` immediately and survives
 * the scenario save's server-side validation (task 0.4).
 */

interface NodeConfigPanelProps {
  /** The selected canvas node, or null when the panel is closed. */
  node: ConfigurableNode | null;
  /** The node's catalog deployment spec — the defaults the panel shows. */
  deployment?: CatalogDeployment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Persists a new `data.config` document; `undefined` removes the key. */
  onConfigChange: (nodeId: string, config: NodeConfig | undefined) => void;
}

/** Strip display fields, producing the exact entry persisted in `config.env`. */
const toEnvEntry = (row: EnvRow): NodeConfigEnv => ({
  name: row.name,
  ...(row.value !== undefined ? { value: row.value } : {}),
  ...(row.fromEdge ? { fromEdge: row.fromEdge } : {}),
});

const FROM_EDGE_LABELS = { target: 'target edge', reaction: 'reaction edge' } as const;

export function NodeConfigPanel({
  node,
  deployment,
  open,
  onOpenChange,
  onConfigChange,
}: NodeConfigPanelProps) {
  const config = nodeConfigOf(node);
  const label = String(node?.data?.label ?? node?.id ?? '');

  const emit = (next: NodeConfig | undefined) => {
    if (node) onConfigChange(node.id, next === undefined ? undefined : pruneConfig(next));
  };

  /** Write a patched env row: renaming a node-added row re-keys the override. */
  const emitEnv = (row: EnvRow, patch: Partial<NodeConfigEnv>) => {
    const base =
      patch.name !== undefined && patch.name !== row.name
        ? removeEnvOverride(config, row.name)
        : config;
    const merged: NodeConfigEnv = { ...toEnvEntry(row), ...patch };
    emit(
      upsertEnvOverride(base, {
        name: merged.name,
        ...(merged.value !== undefined ? { value: merged.value } : {}),
        ...(merged.fromEdge ? { fromEdge: merged.fromEdge } : {}),
      })
    );
  };

  const envRows = effectiveEnv(deployment, config);
  const { args, overridden: argsOverridden } = effectiveArgs(deployment, config);
  const catalogArgs = deployment?.args ?? [];
  const fileRows = effectiveConfigFiles(deployment, config);
  const hasOverrides = Boolean(
    config.env?.length || config.args !== undefined || config.configFiles?.length
  );

  const addConfigFile = () => {
    // Find a placeholder mountPath that does not collide with an existing row.
    let candidate = '/opt/custom.conf';
    for (let i = 2; fileRows.some((f) => f.mountPath === candidate); i += 1) {
      candidate = `/opt/custom-${i}.conf`;
    }
    emit(upsertConfigFile(config, { mountPath: candidate, content: '' }));
  };

  const clearAll = () => {
    const next = { ...config };
    delete next.env;
    delete next.args;
    delete next.configFiles;
    emit(Object.keys(next).length ? next : undefined);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-xl" data-testid="node-config-panel">
        <SheetHeader>
          <SheetTitle>Node configuration — {label}</SheetTitle>
          <SheetDescription>
            Per-node overrides for this node only. Catalog defaults apply until a field is edited;
            overrides are saved into the scenario topology.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6 px-1 pb-6">
          {/* ── Environment variables ─────────────────────────────────── */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Environment variables</h3>
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => emit(upsertEnvOverride(config, { name: 'NEW_VAR', value: '' }))}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add variable
              </Button>
            </div>
            {envRows.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No environment variables — the catalog image defaults apply.
              </p>
            )}
            <div className="space-y-2">
              {envRows.map((row) => (
                <div key={`${row.source}-${row.name}`} className="space-y-1">
                  <div className="flex items-center gap-2">
                    {row.source === 'added' ? (
                      <Input
                        value={row.name}
                        onChange={(e) => emitEnv(row, { name: e.target.value })}
                        className="h-8 w-36 font-mono text-xs"
                        aria-label="Variable name"
                      />
                    ) : (
                      <span className="w-36 truncate font-mono text-xs" title={row.name}>
                        {row.name}
                      </span>
                    )}
                    <Input
                      value={row.value ?? ''}
                      onChange={(e) => emitEnv(row, { value: e.target.value })}
                      disabled={Boolean(row.fromEdge)}
                      placeholder={row.fromEdge ? 'resolved at deploy' : 'value'}
                      className="h-8 flex-1 font-mono text-xs"
                      aria-label={`Value for ${row.name}`}
                    />
                    <Select
                      value={row.fromEdge ?? 'static'}
                      onValueChange={(v: string) =>
                        emitEnv(row, {
                          fromEdge: v === 'static' ? undefined : (v as 'target' | 'reaction'),
                          // A fromEdge value is resolved at deploy — drop any
                          // static value so the document is not misleading.
                          ...(v !== 'static' ? { value: undefined } : {}),
                        })
                      }
                    >
                      <SelectTrigger className="h-8 w-32" aria-label={`Source for ${row.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="static">static</SelectItem>
                        <SelectItem value="target">target edge</SelectItem>
                        <SelectItem value="reaction">reaction edge</SelectItem>
                      </SelectContent>
                    </Select>
                    {row.source === 'catalog' && row.overridden && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        title="Reset to catalog default"
                        onClick={() => emit(removeEnvOverride(config, row.name))}
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    )}
                    {row.source === 'added' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        title="Remove variable"
                        onClick={() => emit(removeEnvOverride(config, row.name))}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pl-1">
                    <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal uppercase">
                      {row.source === 'added' ? 'added' : row.overridden ? 'override' : 'default'}
                    </Badge>
                    {row.fromEdge && (
                      <span className="text-[10px] text-muted-foreground">
                        value resolved from the {FROM_EDGE_LABELS[row.fromEdge]} at deploy
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Arguments ─────────────────────────────────────────────── */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Arguments</h3>
              {argsOverridden ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => {
                    const next = { ...config };
                    delete next.args;
                    emit(next);
                  }}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset to catalog args
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => emit({ ...config, args: [...catalogArgs] })}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {catalogArgs.length ? 'Override args' : 'Set args'}
                </Button>
              )}
            </div>
            {argsOverridden ? (
              <>
                <Textarea
                  value={args.join('\n')}
                  onChange={(e) => {
                    const lines = e.target.value.split('\n');
                    // Drop only the trailing newline artifact so interior
                    // blank lines keep editing smoothly.
                    const next = lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;
                    emit({ ...config, args: next });
                  }}
                  placeholder="one argument per line — e.g. mag&#10;synflood&#10;--target-ip"
                  className="font-mono text-xs"
                  rows={Math.max(3, Math.min(args.length + 1, 10))}
                  aria-label="Arguments"
                />
                {catalogArgs.length > 0 && (
                  <p className="text-[10px] text-muted-foreground font-mono">
                    catalog default: {catalogArgs.join(' ')}
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-1">
                {catalogArgs.length ? (
                  <div className="rounded-md border bg-muted/30 p-2 font-mono text-xs space-y-0.5">
                    {catalogArgs.map((arg, i) => (
                      <div key={i}>{arg}</div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No arguments — the catalog image defaults apply.
                  </p>
                )}
                <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal uppercase">
                  default
                </Badge>
              </div>
            )}
          </section>

          {/* ── Config files ──────────────────────────────────────────── */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Config files</h3>
              <Button variant="outline" size="sm" className="h-7" onClick={addConfigFile}>
                <Plus className="h-3 w-3 mr-1" />
                Add config file
              </Button>
            </div>
            {fileRows.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No config files — the catalog image defaults apply.
              </p>
            )}
            <div className="space-y-4">
              {fileRows.map((file) => (
                <div key={`${file.source}-${file.mountPath}`} className="space-y-1">
                  <div className="flex items-center gap-2">
                    {file.source === 'added' ? (
                      <Input
                        value={file.mountPath}
                        onChange={(e) => {
                          const base = removeConfigFile(config, file.mountPath);
                          emit(upsertConfigFile(base, { ...file, mountPath: e.target.value }));
                        }}
                        className="h-8 flex-1 font-mono text-xs"
                        aria-label="Config file path"
                      />
                    ) : (
                      <span className="flex-1 truncate font-mono text-xs" title={file.mountPath}>
                        {file.mountPath}
                      </span>
                    )}
                    <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal uppercase">
                      {file.source === 'added' ? 'added' : file.overridden ? 'override' : 'default'}
                    </Badge>
                    {file.source === 'catalog' && file.overridden && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        title="Reset to catalog content"
                        onClick={() => emit(removeConfigFile(config, file.mountPath))}
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    )}
                    {file.source === 'added' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        title="Remove config file"
                        onClick={() => emit(removeConfigFile(config, file.mountPath))}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <Textarea
                    value={file.content}
                    onChange={(e) =>
                      emit(
                        upsertConfigFile(config, {
                          mountPath: file.mountPath,
                          content: e.target.value,
                        })
                      )
                    }
                    className="font-mono text-xs"
                    rows={Math.max(3, Math.min(file.content.split('\n').length + 1, 12))}
                    aria-label={`Content of ${file.mountPath}`}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* ── Footer ────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between border-t pt-4">
            <p className="text-[10px] text-muted-foreground">
              Overrides apply to this node only — the service catalog is unchanged.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              disabled={!hasOverrides}
              onClick={clearAll}
            >
              Clear all overrides
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
