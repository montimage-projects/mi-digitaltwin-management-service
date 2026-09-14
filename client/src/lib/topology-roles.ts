/**
 * Scenario-role helpers for the topology editor — task 3.1 of the Montimage
 * attack→detect→respond plan (docs/playbooks/montimage-attack-detect-respond-plan.md).
 *
 * Nodes carry a scenario role (`Service.deployment.role`: attack / target /
 * monitor / reaction / generic) that renders as a colored badge on the node
 * card, and a `deployment.attachMode` of `sidecar` that docks the node inside
 * the host its `monitors` edge points at — mirroring the deploy engine's
 * grouping in `server/src/services/kubernetesDeploy.ts`.
 */

/** The four scenario roles that render a badge (`generic` renders none). */
export const BADGED_ROLES = ['attack', 'target', 'monitor', 'reaction'] as const;
export type BadgedRole = (typeof BADGED_ROLES)[number];

type AttachMode = 'standalone' | 'sidecar';

/**
 * Canonical scenario edge kinds — mirrors `EDGE_KIND_ALIASES` in
 * `server/src/services/kubernetesDeploy.ts` (task 3.2 persists the plural
 * spellings; singulars stay valid for hand-written topologies).
 */
export type EdgeKind = 'attack' | 'monitor' | 'notify' | 'acts-on';

const EDGE_KIND_ALIASES: Record<string, EdgeKind> = {
  attack: 'attack',
  attacks: 'attack',
  monitor: 'monitor',
  monitors: 'monitor',
  notify: 'notify',
  notifies: 'notify',
  'acts-on': 'acts-on',
  actson: 'acts-on',
};

/** Normalize a raw edge type/label into a canonical {@link EdgeKind}. */
export function edgeKindOf(raw: unknown): EdgeKind | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  return EDGE_KIND_ALIASES[normalized] ?? null;
}

/**
 * Persisted edge-type spellings — the values task 3.2 writes to
 * `topology.edges[].data.edgeType` and to `connections[].type` in the YAML
 * view. `edgeKindOf` maps every one of them back to its canonical kind, which
 * is what makes the YAML representation round-trip.
 */
export type ScenarioEdgeType = 'attacks' | 'monitors' | 'notifies' | 'acts-on';

/** Canonical edge kind → spelling persisted on edges and emitted in YAML. */
export const EDGE_TYPE_SPELLING: Record<EdgeKind, ScenarioEdgeType> = {
  attack: 'attacks',
  monitor: 'monitors',
  notify: 'notifies',
  'acts-on': 'acts-on',
};

/**
 * Legal scenario connections by role pair — the wiring table of
 * docs/playbooks/montimage-attack-detect-respond-plan.md (task 3.2):
 * attack → target (attacks), monitor → target or attack (monitors),
 * monitor → reaction (notifies), reaction → target (acts-on).
 */
const EDGE_KIND_BY_ROLE_PAIR: Record<BadgedRole, Partial<Record<BadgedRole, EdgeKind>>> = {
  attack: { target: 'attack' },
  monitor: { target: 'monitor', attack: 'monitor', reaction: 'notify' },
  reaction: { target: 'acts-on' },
  target: {},
};

/** One-line summary of the legal role pairs, embedded in rejection messages. */
export const EDGE_RULE_SUMMARY =
  'attack → target (attacks), monitor → target/attack (monitors), ' +
  'monitor → reaction (notifies), reaction → target (acts-on)';

export type ConnectionPlan =
  { ok: true; edgeType: ScenarioEdgeType | undefined } | { ok: false; error: string };

/**
 * Plan a new canvas edge between two nodes, given a React Flow connection:
 * the persisted {@link ScenarioEdgeType} when both endpoint roles form a
 * legal pair; an untyped edge (`edgeType: undefined`) when either side has no
 * scenario role, so existing generic connections keep working; or a rejection
 * error when both roles are known but the combination is not a legal scenario
 * edge (task 3.2).
 */
export function planTopologyEdge(
  connection: { source?: string | null; target?: string | null },
  nodes: RoleNode[],
  serviceById: ReadonlyMap<string, RoleService>
): ConnectionPlan {
  const roleOf = (id: string | null | undefined): BadgedRole | undefined => {
    const node = nodes.find((n) => n.id === id);
    return node
      ? resolveNodeRole(node.data, serviceById.get(String(node.data?.serviceId)))
      : undefined;
  };
  const sourceRole = roleOf(connection.source);
  const targetRole = roleOf(connection.target);
  if (!sourceRole || !targetRole) return { ok: true, edgeType: undefined };
  const kind = EDGE_KIND_BY_ROLE_PAIR[sourceRole]?.[targetRole];
  if (!kind) {
    return {
      ok: false,
      error: `Cannot connect a ${sourceRole} node to a ${targetRole} node — valid edges: ${EDGE_RULE_SUMMARY}.`,
    };
  }
  return { ok: true, edgeType: EDGE_TYPE_SPELLING[kind] };
}

/**
 * Role pairs the Auto-wire action generates (task 5.3): attack → target
 * (`attacks`), monitor → target (`monitors`), monitor → reaction
 * (`notifies`), reaction → target (`acts-on`). A strict subset of
 * `EDGE_KIND_BY_ROLE_PAIR` — monitor → attack stays legal for hand-drawn
 * edges but is never generated automatically, so the canonical
 * four-service scenario yields exactly the four-edge wiring.
 */
export const AUTO_WIRE_ROLE_PAIRS: ReadonlyArray<readonly [BadgedRole, BadgedRole]> = [
  ['attack', 'target'],
  ['monitor', 'target'],
  ['monitor', 'reaction'],
  ['reaction', 'target'],
];

/** Column layout for auto-wired graphs: attacks/monitors left of the
 * target column, reactions right (task 5.3). */
const AUTO_WIRE_COLUMN_GAP = 280;
const AUTO_WIRE_ROW_GAP = 160;
const AUTO_WIRE_COLUMNS: ReadonlyArray<{ roles: readonly BadgedRole[]; offset: number }> = [
  { roles: ['attack', 'monitor'], offset: -AUTO_WIRE_COLUMN_GAP },
  { roles: ['target'], offset: 0 },
  { roles: ['reaction'], offset: AUTO_WIRE_COLUMN_GAP },
];

export interface AutoWirePlan {
  /**
   * New edges to append — the same persisted shape as a user-drawn typed
   * edge (`label` + `data.edgeType` carry the {@link ScenarioEdgeType}
   * spelling), so the YAML view round-trips them.
   */
  edges: RoleEdge[];
  /**
   * Suggested position per role-tagged node id; empty when fewer than two
   * nodes carry a scenario role. Unroled nodes are never moved.
   */
  positions: Map<string, { x: number; y: number }>;
}

/**
 * Plan the Auto-wire action (task 5.3): generate every role-derived typed
 * edge that is not already drawn — an ordered node pair counts as drawn
 * when ANY edge (typed or not) already connects source → target, so edges
 * the user drew are never duplicated — and compute the role-column layout
 * (attacks and monitors left of the targets, reactions right). Pure: the
 * canvas applies the result and propagates it, which regenerates YAML.
 */
export function planAutoWire(
  nodes: RoleNode[],
  edges: RoleEdge[],
  serviceById: ReadonlyMap<string, RoleService>
): AutoWirePlan {
  const roleOf = (n: RoleNode): BadgedRole | undefined =>
    resolveNodeRole(n.data, serviceById.get(String(n.data?.serviceId)));

  const byRole = new Map<BadgedRole, RoleNode[]>();
  for (const n of nodes) {
    const role = roleOf(n);
    if (role) byRole.set(role, [...(byRole.get(role) ?? []), n]);
  }

  const drawn = new Set(edges.map((e) => `${e.source}->${e.target}`));
  const newEdges: RoleEdge[] = [];
  for (const [sourceRole, targetRole] of AUTO_WIRE_ROLE_PAIRS) {
    const kind = EDGE_KIND_BY_ROLE_PAIR[sourceRole][targetRole];
    if (!kind) continue;
    const edgeType = EDGE_TYPE_SPELLING[kind];
    for (const source of byRole.get(sourceRole) ?? []) {
      for (const target of byRole.get(targetRole) ?? []) {
        if (source.id === target.id) continue;
        const pairKey = `${source.id}->${target.id}`;
        if (drawn.has(pairKey)) continue;
        drawn.add(pairKey);
        newEdges.push({
          id: `edge-auto-${source.id}-${target.id}`,
          source: source.id,
          target: target.id,
          animated: true,
          label: edgeType,
          data: { edgeType },
        });
      }
    }
  }

  const positions = new Map<string, { x: number; y: number }>();
  const roled = [...byRole.values()].flat();
  if (roled.length >= 2) {
    // Anchor on the target column when targets exist so the layout arranges
    // around them; otherwise keep the graph's current center of mass.
    const anchors = byRole.get('target')?.length ? byRole.get('target')! : roled;
    const anchorX = anchors.reduce((sum, n) => sum + (n.position?.x ?? 0), 0) / anchors.length;
    const anchorY = anchors.reduce((sum, n) => sum + (n.position?.y ?? 0), 0) / anchors.length;
    for (const { roles, offset } of AUTO_WIRE_COLUMNS) {
      // Role order first (attacks stack above monitors), then the node's
      // current vertical position — deterministic regardless of drop order.
      const column = roles.flatMap((role) =>
        (byRole.get(role) ?? [])
          .slice()
          .sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0) || a.id.localeCompare(b.id))
      );
      column.forEach((n, i) => {
        positions.set(n.id, {
          x: anchorX + offset,
          y: anchorY + (i - (column.length - 1) / 2) * AUTO_WIRE_ROW_GAP,
        });
      });
    }
  }

  return { edges: newEdges, positions };
}

/** Minimal view of a catalog service the decorator needs. */
export interface RoleService {
  _id: string;
  deployment?: {
    role?: string;
    attachMode?: string;
  };
}

/** Minimal structural view of a stored topology node. */
export interface RoleNode {
  id: string;
  position: { x: number; y: number };
  data?: {
    role?: string;
    attachMode?: string;
    type?: string;
    serviceId?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Minimal structural view of a stored topology edge. */
export interface RoleEdge {
  id?: string;
  source?: string;
  target?: string;
  type?: string;
  data?: { type?: unknown; edgeType?: unknown };
  [key: string]: unknown;
}

function isBadgedRole(role: unknown): role is BadgedRole {
  return typeof role === 'string' && (BADGED_ROLES as readonly string[]).includes(role);
}

/**
 * Resolve the badged role for a node. Priority: the catalog service's
 * `deployment.role` (authoritative, reflects current catalog data), then the
 * role persisted on `node.data` at add time, then — for topologies saved
 * before deployment specs existed — a `data.type` that is itself a role
 * category. An explicit `generic` (or absent) role renders no badge.
 */
export function resolveNodeRole(
  data: RoleNode['data'] | undefined,
  service: RoleService | undefined
): BadgedRole | undefined {
  const role = (service?.deployment?.role ?? data?.role)?.toLowerCase();
  if (isBadgedRole(role)) return role;
  if (role !== undefined) return undefined; // 'generic' or unknown — no badge
  const type = data?.type?.toLowerCase();
  return isBadgedRole(type) ? type : undefined;
}

/** Resolve `attachMode` — catalog spec first, persisted node data as fallback. */
export function resolveNodeAttachMode(
  data: RoleNode['data'] | undefined,
  service: RoleService | undefined
): AttachMode | undefined {
  const mode = service?.deployment?.attachMode ?? data?.attachMode;
  return mode?.toLowerCase() === 'sidecar'
    ? 'sidecar'
    : mode?.toLowerCase() === 'standalone'
      ? 'standalone'
      : undefined;
}

function edgeKind(edge: RoleEdge): EdgeKind | null {
  return edgeKindOf(edge.data?.edgeType) ?? edgeKindOf(edge.data?.type) ?? edgeKindOf(edge.type);
}

export interface SidecarAttachments {
  /** Sidecar node id → ultimate non-sidecar host node id. */
  hostByNodeId: Map<string, string>;
  /**
   * Ids of the `monitors` edges that established an attachment — rendered
   * `hidden` since the nested sidecar already shows the relationship.
   */
  hiddenEdgeIds: Set<string>;
}

/**
 * Map each sidecar node to the host it attaches to, following `monitors`
 * edges like the deploy engine's `hostFor` (`kubernetesDeploy.ts`): a
 * sidecar rides on the pod of the node its monitor edge targets, following
 * the chain when that target is itself a sidecar. Sidecars with no monitor
 * edge, a dangling target, or a monitor-edge cycle simply stay unattached —
 * the deploy engine surfaces the configuration error on deploy.
 */
export function computeSidecarAttachments(
  nodes: RoleNode[],
  edges: RoleEdge[],
  serviceById: ReadonlyMap<string, RoleService>
): SidecarAttachments {
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const attachModeOf = (node: RoleNode | undefined): AttachMode | undefined =>
    node
      ? resolveNodeAttachMode(node.data, serviceById.get(String(node.data?.serviceId)))
      : undefined;
  const isSidecar = (id: string) => attachModeOf(nodesById.get(id)) === 'sidecar';

  const hostByNodeId = new Map<string, string>();
  const hiddenEdgeIds = new Set<string>();

  for (const node of nodes) {
    if (attachModeOf(node) !== 'sidecar') continue;

    const seen = new Set<string>([node.id]);
    let current: RoleNode = node;
    let firstEdgeId: string | undefined;
    let host: RoleNode | undefined;

    while (isSidecar(current.id)) {
      const monitorEdge = edges.find(
        (e) => e.source === current.id && edgeKind(e) === 'monitor' && nodesById.has(e.target ?? '')
      );
      const nextId = monitorEdge?.target;
      if (!nextId || seen.has(nextId)) {
        host = undefined;
        break;
      }
      if (current.id === node.id && monitorEdge?.id) {
        firstEdgeId = monitorEdge.id;
      }
      seen.add(nextId);
      current = nodesById.get(nextId)!;
      host = current;
    }

    if (host && host.id !== node.id) {
      hostByNodeId.set(node.id, host.id);
      if (firstEdgeId) hiddenEdgeIds.add(firstEdgeId);
    }
  }

  return { hostByNodeId, hiddenEdgeIds };
}

/** Offset (relative to the host) where an attached sidecar docks. */
export const SIDECAR_DOCK = { x: 8, y: 64, rowHeight: 40 } as const;

/**
 * Decorate topology nodes/edges for rendering: resolves `role`/`attachMode`
 * onto `node.data` (badge + sidecar styling in the node component), parents
 * each attached sidecar under its host (docked, non-draggable, expanding the
 * host card) and hides the monitor edges that established the attachment.
 * Parent nodes are ordered before their children as React Flow requires.
 */
export function applyTopologyDecorations(
  nodes: RoleNode[],
  edges: RoleEdge[],
  serviceById: ReadonlyMap<string, RoleService>
): { nodes: RoleNode[]; edges: RoleEdge[] } {
  const { hostByNodeId, hiddenEdgeIds } = computeSidecarAttachments(nodes, edges, serviceById);
  const nodesById = new Map(nodes.map((n) => [n.id, n]));

  const siblingIndex = new Map<string, number>();
  const decorated: RoleNode[] = [];
  const attached: RoleNode[] = [];

  for (const node of nodes) {
    const service = serviceById.get(String(node.data?.serviceId));
    const role = resolveNodeRole(node.data, service);
    const attachMode = resolveNodeAttachMode(node.data, service);
    const hostId = hostByNodeId.get(node.id);

    const enriched: RoleNode = {
      ...node,
      position: node.position ?? { x: 0, y: 0 },
      data: { ...node.data, role, attachMode },
    };

    if (hostId) {
      const idx = siblingIndex.get(hostId) ?? 0;
      siblingIndex.set(hostId, idx + 1);
      attached.push({
        ...enriched,
        data: {
          ...enriched.data,
          attachedTo: hostId,
          hostLabel: nodesById.get(hostId)?.data?.label,
        },
        parentId: hostId,
        extent: 'parent',
        expandParent: true,
        draggable: false,
        position: { x: SIDECAR_DOCK.x, y: SIDECAR_DOCK.y + idx * SIDECAR_DOCK.rowHeight },
      });
    } else {
      // Strip docking props persisted by a previous render — a sidecar whose
      // monitor edge was removed must not keep a dangling parentId.
      delete enriched.parentId;
      delete enriched.extent;
      delete enriched.expandParent;
      delete enriched.draggable;
      delete enriched.data?.attachedTo;
      delete enriched.data?.hostLabel;
      decorated.push(enriched);
    }
  }

  return {
    nodes: [...decorated, ...attached],
    edges: edges.map((edge) =>
      edge.id && hiddenEdgeIds.has(edge.id) ? { ...edge, hidden: true } : edge
    ),
  };
}
