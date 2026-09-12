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
type EdgeKind = 'attack' | 'monitor' | 'notify' | 'acts-on';

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
