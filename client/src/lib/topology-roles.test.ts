import { describe, it, expect } from 'vitest';
import {
  edgeKindOf,
  resolveNodeRole,
  resolveNodeAttachMode,
  computeSidecarAttachments,
  applyTopologyDecorations,
  SIDECAR_DOCK,
  type RoleEdge,
  type RoleNode,
  type RoleService,
} from './topology-roles';

const service = (id: string, deployment?: { role?: string; attachMode?: string }): RoleService => ({
  _id: id,
  deployment,
});

const node = (
  id: string,
  data: RoleNode['data'] = {},
  extra: Partial<RoleNode> = {}
): RoleNode => ({ id, position: { x: 0, y: 0 }, data, ...extra });

const edge = (
  id: string,
  source: string,
  target: string,
  extra: Partial<RoleEdge> = {}
): RoleEdge => ({ id, source, target, ...extra });

const serviceMap = (services: RoleService[]) => new Map(services.map((s) => [s._id, s]));

describe('edgeKindOf', () => {
  it('maps canonical and alias spellings', () => {
    expect(edgeKindOf('monitors')).toBe('monitor');
    expect(edgeKindOf('monitor')).toBe('monitor');
    expect(edgeKindOf('attacks')).toBe('attack');
    expect(edgeKindOf('notifies')).toBe('notify');
    expect(edgeKindOf('acts-on')).toBe('acts-on');
    expect(edgeKindOf('actson')).toBe('acts-on');
  });

  it('normalizes case, whitespace and underscores', () => {
    expect(edgeKindOf('  Monitors ')).toBe('monitor');
    expect(edgeKindOf('ACTS_ON')).toBe('acts-on');
  });

  it('returns null for untyped or unknown edges', () => {
    expect(edgeKindOf(undefined)).toBeNull();
    expect(edgeKindOf('default')).toBeNull();
    expect(edgeKindOf(42)).toBeNull();
  });
});

describe('resolveNodeRole', () => {
  it('prefers the catalog deployment role', () => {
    expect(resolveNodeRole({ role: 'attack' }, service('s1', { role: 'monitor' }))).toBe('monitor');
  });

  it('falls back to the role persisted on node data', () => {
    expect(resolveNodeRole({ role: 'reaction' }, undefined)).toBe('reaction');
    expect(resolveNodeRole({ role: 'reaction' }, service('s1'))).toBe('reaction');
  });

  it('falls back to a role-category data.type for legacy nodes', () => {
    expect(resolveNodeRole({ type: 'monitor' }, undefined)).toBe('monitor');
    expect(resolveNodeRole({ type: 'dev services' }, undefined)).toBeUndefined();
  });

  it('renders no badge for generic or unknown roles', () => {
    expect(resolveNodeRole({ role: 'generic' }, undefined)).toBeUndefined();
    expect(
      resolveNodeRole({ type: 'monitor' }, service('s1', { role: 'generic' }))
    ).toBeUndefined();
    expect(resolveNodeRole({}, undefined)).toBeUndefined();
  });
});

describe('resolveNodeAttachMode', () => {
  it('resolves sidecar from catalog or node data', () => {
    expect(resolveNodeAttachMode({}, service('s1', { attachMode: 'sidecar' }))).toBe('sidecar');
    expect(resolveNodeAttachMode({ attachMode: 'sidecar' }, undefined)).toBe('sidecar');
    expect(resolveNodeAttachMode({}, service('s1', { attachMode: 'standalone' }))).toBe(
      'standalone'
    );
    expect(resolveNodeAttachMode({}, undefined)).toBeUndefined();
  });

  it('lets the catalog spec win over persisted node data', () => {
    expect(
      resolveNodeAttachMode({ attachMode: 'sidecar' }, service('s1', { attachMode: 'standalone' }))
    ).toBe('standalone');
  });
});

describe('computeSidecarAttachments', () => {
  const host = node('host-1', { label: 'http-sim', serviceId: 'svc-target' });
  const sidecar = node('probe-1', { label: 'MMT-PROBE', serviceId: 'svc-probe' });
  const services = serviceMap([
    service('svc-target', { role: 'target', attachMode: 'standalone' }),
    service('svc-probe', { role: 'monitor', attachMode: 'sidecar' }),
  ]);

  it('attaches a sidecar to the host its monitor edge targets', () => {
    const edges = [edge('e1', 'probe-1', 'host-1', { data: { edgeType: 'monitors' } })];
    const { hostByNodeId, hiddenEdgeIds } = computeSidecarAttachments(
      [host, sidecar],
      edges,
      services
    );
    expect(hostByNodeId.get('probe-1')).toBe('host-1');
    expect(hiddenEdgeIds.has('e1')).toBe(true);
  });

  it('accepts edge.type as the kind source', () => {
    const edges = [edge('e1', 'probe-1', 'host-1', { type: 'monitor' })];
    const { hostByNodeId } = computeSidecarAttachments([host, sidecar], edges, services);
    expect(hostByNodeId.get('probe-1')).toBe('host-1');
  });

  it('does not attach on an untyped edge', () => {
    const edges = [edge('e1', 'probe-1', 'host-1')];
    const { hostByNodeId, hiddenEdgeIds } = computeSidecarAttachments(
      [host, sidecar],
      edges,
      services
    );
    expect(hostByNodeId.size).toBe(0);
    expect(hiddenEdgeIds.size).toBe(0);
  });

  it('does not attach on a non-monitor edge', () => {
    const edges = [edge('e1', 'probe-1', 'host-1', { data: { edgeType: 'notifies' } })];
    const { hostByNodeId } = computeSidecarAttachments([host, sidecar], edges, services);
    expect(hostByNodeId.size).toBe(0);
  });

  it('follows a sidecar chain to the ultimate host', () => {
    const inner = node('probe-2', { label: 'inner', attachMode: 'sidecar' });
    const edges = [
      edge('e1', 'probe-1', 'probe-2', { data: { edgeType: 'monitors' } }),
      edge('e2', 'probe-2', 'host-1', { data: { edgeType: 'monitors' } }),
    ];
    const { hostByNodeId } = computeSidecarAttachments([host, sidecar, inner], edges, services);
    expect(hostByNodeId.get('probe-1')).toBe('host-1');
    expect(hostByNodeId.get('probe-2')).toBe('host-1');
  });

  it('leaves a sidecar unattached on a monitor-edge cycle', () => {
    const other = node('probe-2', { label: 'inner', attachMode: 'sidecar' });
    const edges = [
      edge('e1', 'probe-1', 'probe-2', { data: { edgeType: 'monitors' } }),
      edge('e2', 'probe-2', 'probe-1', { data: { edgeType: 'monitors' } }),
    ];
    const { hostByNodeId } = computeSidecarAttachments([sidecar, other], edges, services);
    expect(hostByNodeId.size).toBe(0);
  });

  it('ignores monitor edges to nodes outside the topology', () => {
    const edges = [edge('e1', 'probe-1', 'ghost', { data: { edgeType: 'monitors' } })];
    const { hostByNodeId } = computeSidecarAttachments([host, sidecar], edges, services);
    expect(hostByNodeId.size).toBe(0);
  });
});

describe('applyTopologyDecorations', () => {
  it('resolves roles onto node data and keeps unroled nodes badge-free', () => {
    const nodes = [
      node('n1', { label: 'mag', serviceId: 's-att' }),
      node('n2', { label: 'db', serviceId: 's-db' }),
    ];
    const services = serviceMap([
      service('s-att', { role: 'attack' }),
      service('s-db', { role: 'generic' }),
    ]);
    const { nodes: out } = applyTopologyDecorations(nodes, [], services);
    expect(out[0].data?.role).toBe('attack');
    expect(out[1].data?.role).toBeUndefined();
  });

  it('docks an attached sidecar under its host, parent ordered first', () => {
    const nodes = [
      node('probe-1', { label: 'MMT-PROBE', serviceId: 's-probe' }),
      node('host-1', { label: 'http-sim', serviceId: 's-host' }),
    ];
    const edges = [edge('e1', 'probe-1', 'host-1', { data: { edgeType: 'monitors' } })];
    const services = serviceMap([
      service('s-probe', { role: 'monitor', attachMode: 'sidecar' }),
      service('s-host', { role: 'target' }),
    ]);

    const { nodes: out, edges: outEdges } = applyTopologyDecorations(nodes, edges, services);

    // Parent (host) must precede the child in the node array for React Flow.
    expect(out.map((n) => n.id)).toEqual(['host-1', 'probe-1']);

    const docked = out.find((n) => n.id === 'probe-1')!;
    expect(docked.parentId).toBe('host-1');
    expect(docked.extent).toBe('parent');
    expect(docked.expandParent).toBe(true);
    expect(docked.draggable).toBe(false);
    expect(docked.position).toEqual({ x: SIDECAR_DOCK.x, y: SIDECAR_DOCK.y });
    expect(docked.data?.attachedTo).toBe('host-1');
    expect(docked.data?.hostLabel).toBe('http-sim');
    expect(docked.data?.role).toBe('monitor');

    // The monitor edge that established the attachment is hidden.
    expect(outEdges[0].hidden).toBe(true);
  });

  it('stacks multiple sidecars under one host', () => {
    const nodes = [
      node('host-1', { label: 'host', serviceId: 's-host' }),
      node('p1', { label: 'p1', serviceId: 's-p' }),
      node('p2', { label: 'p2', serviceId: 's-p2' }),
    ];
    const edges = [
      edge('e1', 'p1', 'host-1', { data: { edgeType: 'monitors' } }),
      edge('e2', 'p2', 'host-1', { data: { edgeType: 'monitors' } }),
    ];
    const services = serviceMap([
      service('s-host', { role: 'target' }),
      service('s-p', { attachMode: 'sidecar' }),
      service('s-p2', { attachMode: 'sidecar' }),
    ]);
    const { nodes: out } = applyTopologyDecorations(nodes, edges, services);
    const p1 = out.find((n) => n.id === 'p1')!;
    const p2 = out.find((n) => n.id === 'p2')!;
    expect(p1.position).toEqual({ x: SIDECAR_DOCK.x, y: SIDECAR_DOCK.y });
    expect(p2.position).toEqual({ x: SIDECAR_DOCK.x, y: SIDECAR_DOCK.y + SIDECAR_DOCK.rowHeight });
  });

  it('strips stale docking props when a sidecar loses its monitor edge', () => {
    const stale = node(
      'probe-1',
      { label: 'p', serviceId: 's-probe', attachedTo: 'host-1' },
      { parentId: 'host-1', extent: 'parent', expandParent: true, draggable: false }
    );
    const host = node('host-1', { label: 'h' });
    const services = serviceMap([service('s-probe', { attachMode: 'sidecar' })]);
    const { nodes: out } = applyTopologyDecorations([host, stale], [], services);
    const probe = out.find((n) => n.id === 'probe-1')!;
    expect(probe.parentId).toBeUndefined();
    expect(probe.data?.attachedTo).toBeUndefined();
  });
});
