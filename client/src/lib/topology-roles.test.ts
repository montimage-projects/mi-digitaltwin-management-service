import { describe, it, expect } from 'vitest';
import {
  edgeKindOf,
  resolveNodeRole,
  resolveNodeAttachMode,
  computeSidecarAttachments,
  applyTopologyDecorations,
  planTopologyEdge,
  planAutoWire,
  AUTO_WIRE_ROLE_PAIRS,
  EDGE_TYPE_SPELLING,
  SIDECAR_DOCK,
  type AutoWirePlan,
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

describe('EDGE_TYPE_SPELLING', () => {
  it('round-trips every persisted spelling through edgeKindOf', () => {
    for (const spelling of Object.values(EDGE_TYPE_SPELLING)) {
      const kind = edgeKindOf(spelling);
      expect(kind).not.toBeNull();
      expect(EDGE_TYPE_SPELLING[kind!]).toBe(spelling);
    }
  });
});

describe('planTopologyEdge', () => {
  const nodes = [
    node('att', { label: 'mag', serviceId: 's-att' }),
    node('tgt', { label: 'http', serviceId: 's-tgt' }),
    node('mon', { label: 'probe', serviceId: 's-mon' }),
    node('react', { label: 'soar', serviceId: 's-react' }),
    node('db', { label: 'db', serviceId: 's-db' }),
  ];
  const services = serviceMap([
    service('s-att', { role: 'attack' }),
    service('s-tgt', { role: 'target' }),
    service('s-mon', { role: 'monitor' }),
    service('s-react', { role: 'reaction' }),
    service('s-db', { role: 'generic' }),
  ]);
  const plan = (source: string, target: string) =>
    planTopologyEdge({ source, target }, nodes, services);

  it('types each legal role pair with its persisted spelling', () => {
    expect(plan('att', 'tgt')).toEqual({ ok: true, edgeType: 'attacks' });
    expect(plan('mon', 'tgt')).toEqual({ ok: true, edgeType: 'monitors' });
    expect(plan('mon', 'att')).toEqual({ ok: true, edgeType: 'monitors' });
    expect(plan('mon', 'react')).toEqual({ ok: true, edgeType: 'notifies' });
    expect(plan('react', 'tgt')).toEqual({ ok: true, edgeType: 'acts-on' });
  });

  it('rejects illegal role pairs with a descriptive error', () => {
    const res = plan('tgt', 'att');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('target');
      expect(res.error).toContain('attack');
      expect(res.error).toContain('attacks');
    }
    expect(plan('att', 'mon').ok).toBe(false);
    expect(plan('att', 'react').ok).toBe(false);
    expect(plan('att', 'att').ok).toBe(false);
    expect(plan('react', 'att').ok).toBe(false);
    expect(plan('react', 'mon').ok).toBe(false);
    expect(plan('tgt', 'mon').ok).toBe(false);
  });

  it('falls back to the role persisted on node data when the catalog is gone', () => {
    const legacy = [
      node('a', { label: 'a', role: 'attack' }),
      node('t', { label: 't', role: 'target' }),
    ];
    expect(planTopologyEdge({ source: 'a', target: 't' }, legacy, new Map())).toEqual({
      ok: true,
      edgeType: 'attacks',
    });
  });

  it('keeps untyped edges when either side has no scenario role', () => {
    expect(plan('db', 'tgt')).toEqual({ ok: true, edgeType: undefined });
    expect(plan('att', 'db')).toEqual({ ok: true, edgeType: undefined });
    expect(plan('db', 'db')).toEqual({ ok: true, edgeType: undefined });
  });

  it('treats connections to unknown nodes as untyped', () => {
    expect(plan('ghost', 'tgt')).toEqual({ ok: true, edgeType: undefined });
    expect(planTopologyEdge({ source: null, target: 'tgt' }, nodes, services)).toEqual({
      ok: true,
      edgeType: undefined,
    });
  });
});

describe('planAutoWire (task 5.3)', () => {
  const services = serviceMap([
    service('s-att', { role: 'attack' }),
    service('s-tgt', { role: 'target' }),
    service('s-mon', { role: 'monitor' }),
    service('s-react', { role: 'reaction' }),
    service('s-db', { role: 'generic' }),
  ]);
  const nodes = [
    node('att', { label: 'MAG', serviceId: 's-att' }),
    node('tgt', { label: 'CI-SIM', serviceId: 's-tgt' }),
    node('mon', { label: 'MMT-PROBE', serviceId: 's-mon' }),
    node('react', { label: 'AI4SOAR', serviceId: 's-react' }),
    node('db', { label: 'DB', serviceId: 's-db' }),
  ];
  const wired = (plan: AutoWirePlan) =>
    plan.edges.map((e) => `${e.source}->${e.target}:${e.data?.edgeType}`);

  it('generates exactly the four role-derived edges for the demo set', () => {
    const plan = planAutoWire(nodes, [], services);
    expect(wired(plan).sort()).toEqual([
      'att->tgt:attacks',
      'mon->react:notifies',
      'mon->tgt:monitors',
      'react->tgt:acts-on',
    ]);
    for (const e of plan.edges) {
      expect(e.id).toBe(`edge-auto-${e.source}-${e.target}`);
      expect(e.animated).toBe(true);
      expect(e.label).toBe(e.data?.edgeType);
    }
  });

  it('exposes exactly the four auto-wire pairs — monitor → attack is not generated', () => {
    expect(AUTO_WIRE_ROLE_PAIRS).toEqual([
      ['attack', 'target'],
      ['monitor', 'target'],
      ['monitor', 'reaction'],
      ['reaction', 'target'],
    ]);
    const plan = planAutoWire(nodes, [], services);
    expect(plan.edges.some((e) => e.source === 'mon' && e.target === 'att')).toBe(false);
  });

  it('skips pairs the user already wired — typed or untyped', () => {
    const existing = [
      edge('e1', 'att', 'tgt', { data: { edgeType: 'attacks' } }),
      edge('e2', 'mon', 'tgt'), // hand-drawn untyped edge still counts as drawn
    ];
    const plan = planAutoWire(nodes, existing, services);
    expect(wired(plan).sort()).toEqual(['mon->react:notifies', 'react->tgt:acts-on']);
    expect(plan.edges.some((e) => e.source === 'att' && e.target === 'tgt')).toBe(false);
    expect(plan.edges.some((e) => e.source === 'mon' && e.target === 'tgt')).toBe(false);
  });

  it('is idempotent — a second pass over the generated edges adds nothing', () => {
    const first = planAutoWire(nodes, [], services);
    const second = planAutoWire(nodes, [...first.edges], services);
    expect(second.edges).toHaveLength(0);
  });

  it('produces nothing for unroled nodes only', () => {
    const plan = planAutoWire([node('db', { serviceId: 's-db' })], [], services);
    expect(plan.edges).toHaveLength(0);
    expect(plan.positions.size).toBe(0);
  });

  it('lays attacks and monitors left of the target, reactions right', () => {
    const plan = planAutoWire(nodes, [], services);
    const pos = plan.positions;
    expect(pos.get('att')!.x).toBeLessThan(pos.get('tgt')!.x);
    expect(pos.get('mon')!.x).toBeLessThan(pos.get('tgt')!.x);
    expect(pos.get('react')!.x).toBeGreaterThan(pos.get('tgt')!.x);
    expect(pos.has('db')).toBe(false); // unroled nodes keep their position
  });

  it('stacks the left column deterministically — attacks above monitors', () => {
    const plan = planAutoWire([...nodes, node('att2', { serviceId: 's-att' })], [], services);
    // Same-y attacks order by id; the monitor comes after both attacks.
    expect(plan.positions.get('att')!.y).toBeLessThan(plan.positions.get('att2')!.y);
    expect(plan.positions.get('att2')!.y).toBeLessThan(plan.positions.get('mon')!.y);
    // Two attacks wire to the same target.
    expect(plan.edges.filter((e) => e.data?.edgeType === 'attacks')).toHaveLength(2);
  });

  it('keeps a single roled node untouched — nothing to wire or lay out', () => {
    const plan = planAutoWire([node('att', { serviceId: 's-att' })], [], services);
    expect(plan.edges).toHaveLength(0);
    expect(plan.positions.size).toBe(0);
  });

  it('still wires when roles come only from persisted node data', () => {
    const legacy = [
      node('a', { label: 'a', role: 'attack' }),
      node('t', { label: 't', role: 'target' }),
    ];
    const plan = planAutoWire(legacy, [], new Map());
    expect(wired(plan)).toEqual(['a->t:attacks']);
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
