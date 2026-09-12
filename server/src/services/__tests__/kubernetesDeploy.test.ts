import { describe, test, expect, beforeEach, vi } from 'vitest';
import { AppError } from '../../middleware/errorHandler.js';
import { encrypt } from '../../utils/encryption.js';
import type { IInfrastructure } from '../../models/Infrastructure.js';

/**
 * Unit tests for the Kubernetes deploy engine.
 *
 * `@kubernetes/client-node` is fully mocked — there is no cluster in CI/test
 * environments, so the engine is exercised against fake clients only.
 */

const {
  kubeconfigCalls,
  CoreV1Api,
  AppsV1Api,
  BatchV1Api,
  NetworkingV1Api,
  RbacAuthorizationV1Api,
  KubeConfig,
  ApiException,
} = vi.hoisted(() => {
  // A stand-in for the client library's ApiException so `instanceof` checks in
  // the module under test match errors thrown by these tests.
  class ApiException extends Error {
    code: number;
    body: unknown;
    constructor(code: number, message: string, body?: unknown) {
      super(message);
      this.code = code;
      this.body = body;
    }
  }

  // Records how `buildClientFromInfrastructure` loaded the KubeConfig.
  const kubeconfigCalls: { fromString: string[]; fromOptions: unknown[]; throwOnLoad: boolean } = {
    fromString: [],
    fromOptions: [],
    throwOnLoad: false,
  };

  class CoreV1Api {}
  class AppsV1Api {}
  class BatchV1Api {}
  class NetworkingV1Api {}
  class RbacAuthorizationV1Api {}

  class KubeConfig {
    loadFromString(config: string): void {
      if (kubeconfigCalls.throwOnLoad) {
        throw new Error(
          'Error: unable to parse kubeconfig: yaml: line 2: mapping values not allowed'
        );
      }
      kubeconfigCalls.fromString.push(config);
    }
    loadFromOptions(options: unknown): void {
      kubeconfigCalls.fromOptions.push(options);
    }
    makeApiClient(ctor: new () => unknown): unknown {
      return new ctor();
    }
  }

  return {
    kubeconfigCalls,
    CoreV1Api,
    AppsV1Api,
    BatchV1Api,
    NetworkingV1Api,
    RbacAuthorizationV1Api,
    KubeConfig,
    ApiException,
  };
});

vi.mock('@kubernetes/client-node', () => ({
  KubeConfig,
  CoreV1Api,
  AppsV1Api,
  BatchV1Api,
  NetworkingV1Api,
  RbacAuthorizationV1Api,
  ApiException,
}));

const {
  deriveNamespace,
  resolveTopologyNodes,
  deployTopology,
  getDeploymentStatus,
  isDeploymentSettled,
  collectNewPodLogs,
  pingCluster,
  teardownDeployment,
  buildClientFromInfrastructure,
} = await import('../kubernetesDeploy.js');

type ServiceImageSource = Parameters<typeof resolveTopologyNodes>[1][number];

/** Read the first argument of a mock's first call without tuple-type friction. */
function firstCallArg(fn: unknown): unknown {
  return (fn as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0];
}

const SERVICE_ID = '507f1f77bcf86cd799439011';

function makeService(overrides: Partial<ServiceImageSource> = {}): ServiceImageSource {
  return {
    _id: SERVICE_ID,
    currentVersion: '1.0.0',
    uiType: 'web',
    versions: [{ version: '1.0.0', dockerImage: 'registry.example/app:1.0.0' }],
    ...overrides,
  };
}

function makeNode(id: string, data: Record<string, unknown> = {}): unknown {
  return { id, data: { serviceId: SERVICE_ID, ...data } };
}

/** Fake `K8sClients` — every cluster call is a `vi.fn` returning success. */
function makeClients() {
  return {
    core: {
      createNamespace: vi.fn(async () => ({})),
      createNamespacedService: vi.fn(async () => ({ spec: { ports: [{ nodePort: 31567 }] } })),
      createNamespacedConfigMap: vi.fn(async () => ({})),
      createNamespacedServiceAccount: vi.fn(async () => ({})),
      deleteNamespace: vi.fn(async () => ({})),
      listNamespacedPod: vi.fn(async () => ({ items: [] })),
    },
    apps: {
      createNamespacedDeployment: vi.fn(async () => ({})),
      readNamespacedDeployment: vi.fn(async () => ({})),
    },
    batch: {
      createNamespacedJob: vi.fn(async () => ({})),
      readNamespacedJob: vi.fn(async () => ({})),
    },
    networking: {
      createNamespacedNetworkPolicy: vi.fn(async () => ({})),
    },
    rbac: {
      createNamespacedRole: vi.fn(async () => ({})),
      createNamespacedRoleBinding: vi.fn(async () => ({})),
    },
  };
}

describe('deriveNamespace', () => {
  test('produces a deterministic, DNS-1123-safe namespace name', () => {
    const ns = deriveNamespace('507f1f77bcf86cd799439011', '507f191e810c19729de860ea');
    expect(ns).toBe(deriveNamespace('507f1f77bcf86cd799439011', '507f191e810c19729de860ea'));
    expect(ns.startsWith('secsim-')).toBe(true);
    expect(ns.length).toBeLessThanOrEqual(63);
    expect(ns).toMatch(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/);
  });

  test('lowercases and strips non-alphanumeric input', () => {
    const ns = deriveNamespace('ABC-123!!', 'XyZ');
    expect(ns).toMatch(/^[a-z0-9-]+$/);
    expect(ns).toBe('secsim-abc123-xyz');
  });

  test('truncates very long ids and stays a valid, <=63-char DNS-1123 label', () => {
    const ns = deriveNamespace('a'.repeat(200), 'b'.repeat(200));
    expect(ns.length).toBeLessThanOrEqual(63);
    expect(ns).toMatch(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/);
    // Each id contributes at most a 24-char segment (a full MongoDB ObjectId).
    expect(ns).toBe(`secsim-${'a'.repeat(24)}-${'b'.repeat(24)}`);
  });

  test('does not collide for ids that differ only in their trailing bytes', () => {
    // Two MongoDB ObjectIds minted in the same second/process share their
    // timestamp + random prefix and differ only in the trailing counter bytes.
    // Truncating each id to 12 hex chars discarded that counter and produced an
    // identical namespace for two distinct executions — this asserts it no
    // longer does.
    const scenario = '507f1f77bcf86cd799439011';
    const exec1 = '6a4c3d771006abcdef000001';
    const exec2 = '6a4c3d771006abcdef000002';
    const ns1 = deriveNamespace(scenario, exec1);
    const ns2 = deriveNamespace(scenario, exec2);
    expect(ns1).not.toBe(ns2);
    expect(ns1.length).toBeLessThanOrEqual(63);
    expect(ns2.length).toBeLessThanOrEqual(63);
    expect(ns1).toMatch(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/);
    expect(ns2).toMatch(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/);
  });

  test('falls back to scn/exec segments when ids have no usable characters', () => {
    const ns = deriveNamespace('!!!', '@@@');
    expect(ns).toBe('secsim-scn-exec');
  });
});

describe('resolveTopologyNodes', () => {
  test('resolves each node to the referenced version image', () => {
    const resolved = resolveTopologyNodes([makeNode('web-a')], [makeService()]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].image).toBe('registry.example/app:1.0.0');
    expect(resolved[0].serviceId).toBe(SERVICE_ID);
    expect(resolved[0].uiType).toBe('web');
    expect(resolved[0].name).toBe('web-a');
  });

  test('honours an explicitly pinned node version', () => {
    const service = makeService({
      versions: [
        { version: '1.0.0', dockerImage: 'registry.example/app:1.0.0' },
        { version: '2.0.0', dockerImage: 'registry.example/app:2.0.0' },
      ],
    });
    const resolved = resolveTopologyNodes([makeNode('n1', { version: '2.0.0' })], [service]);
    expect(resolved[0].image).toBe('registry.example/app:2.0.0');
  });

  test('generates an RFC-1035-safe resource name from an unfriendly node id', () => {
    const resolved = resolveTopologyNodes([makeNode('1_Weird.Node')], [makeService()]);
    expect(resolved[0].name).toMatch(/^[a-z]([-a-z0-9]*[a-z0-9])?$/);
  });

  test('resolves a multi-node topology, one entry per node in order', () => {
    const resolved = resolveTopologyNodes(
      [makeNode('web-a'), makeNode('web-b'), makeNode('web-c')],
      [makeService()]
    );
    expect(resolved.map((r) => r.name)).toEqual(['web-a', 'web-b', 'web-c']);
  });

  test('falls back to the last version when neither node nor currentVersion match', () => {
    const service = makeService({
      currentVersion: 'nonexistent',
      versions: [
        { version: '1.0.0', dockerImage: 'registry.example/app:1.0.0' },
        { version: '2.0.0', dockerImage: 'registry.example/app:2.0.0' },
      ],
    });
    const resolved = resolveTopologyNodes([makeNode('n1')], [service]);
    expect(resolved[0].image).toBe('registry.example/app:2.0.0');
  });

  test('assigns an index-based node id and name when a node has none', () => {
    const resolved = resolveTopologyNodes([{ data: { serviceId: SERVICE_ID } }], [makeService()]);
    expect(resolved[0].nodeId).toBe('node-0');
    // "node-0" starts with a letter, so it is a valid resource name as-is.
    expect(resolved[0].name).toBe('node-0');
  });

  test('does not deduplicate colliding node ids (caller owns uniqueness)', () => {
    const resolved = resolveTopologyNodes([makeNode('dup'), makeNode('dup')], [makeService()]);
    expect(resolved).toHaveLength(2);
    expect(resolved[0].name).toBe('dup');
    expect(resolved[1].name).toBe('dup');
  });

  test('throws AppError(400) when a node has no serviceId', () => {
    expect(() => resolveTopologyNodes([{ id: 'orphan', data: {} }], [makeService()])).toThrow(
      AppError
    );
  });

  test('throws AppError(400) when the referenced service is missing', () => {
    try {
      resolveTopologyNodes([makeNode('n1')], []);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
    }
  });

  test('throws AppError(400) when the resolved version has no docker image', () => {
    const service = makeService({
      currentVersion: '1.0.0',
      versions: [{ version: '1.0.0', dockerImage: '' }],
    });
    try {
      resolveTopologyNodes([makeNode('n1')], [service]);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
    }
  });
});

describe('resolveTopologyNodes — deployment spec and edge context', () => {
  test('resolves the engine defaults for a service without a deployment spec', () => {
    const resolved = resolveTopologyNodes([makeNode('web-a')], [makeService()]);
    expect(resolved[0].deployment).toEqual({
      kind: 'Deployment',
      role: 'generic',
      attachMode: 'standalone',
      containerPort: 80,
      exposePort: true,
    });
    expect(resolved[0].containerPort).toBe(80);
    expect(resolved[0].edgeContext).toEqual({
      targets: [],
      monitors: [],
      notifies: [],
      actsOn: [],
    });
  });

  test('carries the service deployment spec, overriding engine defaults', () => {
    const service = makeService({
      deployment: {
        kind: 'Job',
        role: 'attack',
        exposePort: false,
        args: ['mag', 'http-get'],
        securityContext: { capabilities: ['NET_ADMIN', 'NET_RAW'] },
        startOrder: 30,
      },
    });
    const resolved = resolveTopologyNodes([makeNode('mag')], [service]);
    const spec = resolved[0].deployment;
    expect(spec.kind).toBe('Job');
    expect(spec.role).toBe('attack');
    expect(spec.exposePort).toBe(false);
    expect(spec.args).toEqual(['mag', 'http-get']);
    expect(spec.securityContext).toEqual({ capabilities: ['NET_ADMIN', 'NET_RAW'] });
    expect(spec.startOrder).toBe(30);
    // Untouched defaults still apply.
    expect(spec.attachMode).toBe('standalone');
    expect(spec.containerPort).toBe(80);
  });

  test('takes the container port from the spec instead of the hard-coded 80', () => {
    const service = makeService({
      deployment: {
        kind: 'Deployment',
        role: 'target',
        containerPort: 8080,
        exposePort: true,
      },
    });
    const resolved = resolveTopologyNodes([makeNode('http-sim')], [service]);
    expect(resolved[0].containerPort).toBe(8080);
    expect(resolved[0].deployment.containerPort).toBe(8080);
  });

  test('node config args replace the catalog args wholesale', () => {
    const service = makeService({
      deployment: { kind: 'Job', role: 'attack', args: ['mag', 'http-get'] },
    });
    const resolved = resolveTopologyNodes(
      [makeNode('mag', { config: { args: ['mag', 'slowloris', '--count', '10'] } })],
      [service]
    );
    expect(resolved[0].deployment.args).toEqual(['mag', 'slowloris', '--count', '10']);
  });

  test('node config env merges by name over the catalog env', () => {
    const service = makeService({
      deployment: {
        kind: 'Deployment',
        role: 'monitor',
        env: [
          { name: 'HOST_INTERFACE', value: 'eth0' },
          { name: 'STATS_PERIOD', value: '5' },
        ],
      },
    });
    const resolved = resolveTopologyNodes(
      [
        makeNode('mmt', {
          config: {
            env: [
              { name: 'HOST_INTERFACE', value: 'eth1' },
              { name: 'EXTRA', value: 'x' },
            ],
          },
        }),
      ],
      [service]
    );
    // Same-name entry replaced in place, untouched entry kept, new name appended.
    expect(resolved[0].deployment.env).toEqual([
      { name: 'HOST_INTERFACE', value: 'eth1' },
      { name: 'STATS_PERIOD', value: '5' },
      { name: 'EXTRA', value: 'x' },
    ]);
  });

  test('node config env applies on a service without a deployment spec', () => {
    const resolved = resolveTopologyNodes(
      [makeNode('web-a', { config: { env: [{ name: 'A', value: '1' }] } })],
      [makeService()]
    );
    expect(resolved[0].deployment.env).toEqual([{ name: 'A', value: '1' }]);
  });

  test('does not merge unvalidated config keys into the spec', () => {
    const resolved = resolveTopologyNodes(
      [
        makeNode('web-a', {
          config: { containerPort: 9090, privileged: true, bogus: 'x' },
        }),
      ],
      [makeService()]
    );
    // Only env/args are the validated override surface; everything else is
    // preserved on the scenario document but ignored by the merge.
    expect(resolved[0].deployment.containerPort).toBe(80);
    expect(resolved[0].deployment).not.toHaveProperty('privileged');
    expect(resolved[0].deployment).not.toHaveProperty('bogus');
  });

  test('resolves the four typed edge kinds into per-node context', () => {
    const edges = [
      { id: 'e1', source: 'mag', target: 'http-sim', type: 'attacks' },
      { id: 'e2', source: 'mmt-probe', target: 'http-sim', type: 'monitors' },
      { id: 'e3', source: 'mmt-probe', target: 'ai4soar', type: 'notifies' },
      { id: 'e4', source: 'ai4soar', target: 'http-sim', type: 'acts-on' },
    ];
    const resolved = resolveTopologyNodes(
      [makeNode('mag'), makeNode('http-sim'), makeNode('mmt-probe'), makeNode('ai4soar')],
      [makeService()],
      edges
    );
    const byId = new Map(resolved.map((r) => [r.nodeId, r]));
    expect(byId.get('mag')?.edgeContext.targets).toEqual(['http-sim']);
    expect(byId.get('mmt-probe')?.edgeContext.monitors).toEqual(['http-sim']);
    expect(byId.get('mmt-probe')?.edgeContext.notifies).toEqual(['ai4soar']);
    expect(byId.get('ai4soar')?.edgeContext.actsOn).toEqual(['http-sim']);
    // The target has no outgoing typed edges — all four lists stay empty.
    expect(byId.get('http-sim')?.edgeContext).toEqual({
      targets: [],
      monitors: [],
      notifies: [],
      actsOn: [],
    });
  });

  test('reads the edge kind from data.edgeType or data.type as well as type', () => {
    const edges = [
      { id: 'e1', source: 'mag', target: 'http-sim', data: { edgeType: 'attacks' } },
      { id: 'e2', source: 'mmt', target: 'http-sim', data: { type: 'monitors' } },
      { id: 'e3', source: 'ai4soar', target: 'http-sim', type: 'acts_on' },
    ];
    const resolved = resolveTopologyNodes(
      [makeNode('mag'), makeNode('http-sim'), makeNode('mmt'), makeNode('ai4soar')],
      [makeService()],
      edges
    );
    const byId = new Map(resolved.map((r) => [r.nodeId, r]));
    expect(byId.get('mag')?.edgeContext.targets).toEqual(['http-sim']);
    expect(byId.get('mmt')?.edgeContext.monitors).toEqual(['http-sim']);
    expect(byId.get('ai4soar')?.edgeContext.actsOn).toEqual(['http-sim']);
  });

  test('skips untyped, malformed and dangling edges instead of failing', () => {
    const edges = [
      { id: 'plain', source: 'a', target: 'b' }, // today's untyped editor edge
      { id: 'unknown-kind', source: 'a', target: 'b', type: 'wires' },
      { id: 'no-target', source: 'a' },
      { source: 'a', target: 42, type: 'attacks' },
      null,
      { id: 'dangling', source: 'a', target: 'ghost', type: 'attacks' },
    ];
    const resolved = resolveTopologyNodes(
      [makeNode('a'), makeNode('b')],
      [makeService()],
      edges as never
    );
    expect(resolved).toHaveLength(2);
    expect(resolved[0].edgeContext.targets).toEqual([]);
  });

  test('collects multiple targets in edge order and deduplicates repeats', () => {
    const edges = [
      { id: 'e1', source: 'mag', target: 't1', type: 'attacks' },
      { id: 'e2', source: 'mag', target: 't2', type: 'attacks' },
      { id: 'e3', source: 'mag', target: 't1', type: 'attacks' },
    ];
    const resolved = resolveTopologyNodes(
      [makeNode('mag'), makeNode('t1'), makeNode('t2')],
      [makeService()],
      edges
    );
    expect(resolved[0].edgeContext.targets).toEqual(['t1', 't2']);
  });
});

describe('deployTopology', () => {
  test('creates deployments and services concurrently via Promise.all', async () => {
    const depCalls: number[] = [];
    const clients = {
      core: {
        createNamespace: vi.fn(async () => ({})),
        createNamespacedService: vi.fn(async () => ({ spec: { ports: [{ nodePort: 31567 }] } })),
        deleteNamespace: vi.fn(async () => ({})),
        listNamespacedPod: vi.fn(async () => ({ items: [] })),
      },
      apps: {
        createNamespacedDeployment: vi.fn(async () => {
          depCalls.push(Date.now());
          return {};
        }),
        readNamespacedDeployment: vi.fn(async () => ({})),
      },
    } as never;

    await deployTopology(clients, {
      namespace: 'secsim-a-b',
      nodes: [makeNode('web-a'), makeNode('web-b'), makeNode('web-c')],
      services: [makeService()],
      endpoint: 'https://10.0.0.1:6443',
    });

    // All three deployments should have been created (concurrently via Promise.all).
    expect(clients.apps.createNamespacedDeployment).toHaveBeenCalledTimes(3);
    expect(clients.core.createNamespacedService).toHaveBeenCalledTimes(3);
    expect(depCalls).toHaveLength(3);
    // All three deployment calls should have started within the same tick.
    const maxDelta = Math.max(...depCalls) - Math.min(...depCalls);
    expect(maxDelta).toBeLessThan(50); // all within 50ms = concurrent
  });

  test('tears down already-created resources on mid-deploy failure', async () => {
    let callCount = 0;
    const clients = {
      core: {
        createNamespace: vi.fn(async () => ({})),
        createNamespacedService: vi.fn(async () => ({ spec: { ports: [{ nodePort: 31567 }] } })),
        deleteNamespace: vi.fn(async () => ({})),
        listNamespacedPod: vi.fn(async () => ({ items: [] })),
      },
      apps: {
        createNamespacedDeployment: vi.fn(async () => {
          callCount++;
          if (callCount === 2) {
            throw new ApiException(500, 'mid-deploy failure');
          }
          return {};
        }),
        readNamespacedDeployment: vi.fn(async () => ({})),
      },
    } as never;

    await expect(
      deployTopology(clients, {
        namespace: 'secsim-a-b',
        nodes: [makeNode('web-a'), makeNode('web-b'), makeNode('web-c')],
        services: [makeService()],
        endpoint: 'https://10.0.0.1:6443',
      })
    ).rejects.toThrow();

    // deleteNamespace should have been called for best-effort teardown.
    expect(clients.core.deleteNamespace).toHaveBeenCalledTimes(1);
    expect((firstCallArg(clients.core.deleteNamespace) as { name: string }).name).toBe(
      'secsim-a-b'
    );
  });

  test('creates a namespace plus a deployment and service per node', async () => {
    const clients = makeClients();
    const result = await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [makeNode('web-a')],
      services: [makeService()],
      endpoint: 'https://10.0.0.1:6443',
    });

    expect(clients.core.createNamespace).toHaveBeenCalledTimes(1);
    const nsArg = firstCallArg(clients.core.createNamespace) as {
      body: { metadata: { name: string } };
    };
    expect(nsArg.body.metadata.name).toBe('secsim-a-b');

    const depArg = firstCallArg(clients.apps.createNamespacedDeployment) as {
      body: { spec: { template: { spec: { containers: { image: string }[] } } } };
    };
    expect(depArg.body.spec.template.spec.containers[0].image).toBe('registry.example/app:1.0.0');

    expect(clients.core.createNamespacedService).toHaveBeenCalledTimes(1);
    expect(result.namespace).toBe('secsim-a-b');
    expect(result.services).toHaveLength(1);
    expect(result.services[0].status).toBe('pending');
    expect(result.services[0].dashboardUrl).toBe('http://10.0.0.1:31567');
  });

  test('creates a deployment + service for every node in a multi-node topology', async () => {
    const clients = makeClients();
    const result = await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [makeNode('web-a'), makeNode('web-b')],
      services: [makeService()],
      endpoint: 'https://10.0.0.1:6443',
    });

    expect(clients.apps.createNamespacedDeployment).toHaveBeenCalledTimes(2);
    expect(clients.core.createNamespacedService).toHaveBeenCalledTimes(2);
    expect(result.services).toHaveLength(2);
    expect(result.services.map((s) => s.name)).toEqual(['web-a', 'web-b']);
  });

  test('deploys on the spec container port instead of the default 80', async () => {
    const clients = makeClients();
    const service = makeService({
      deployment: {
        kind: 'Deployment',
        role: 'target',
        containerPort: 8080,
        exposePort: true,
      },
    });
    await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [makeNode('http-sim')],
      services: [service],
      endpoint: 'https://10.0.0.1:6443',
    });

    const depArg = firstCallArg(clients.apps.createNamespacedDeployment) as {
      body: {
        spec: {
          template: { spec: { containers: { ports: { containerPort: number }[] }[] } };
        };
      };
    };
    expect(depArg.body.spec.template.spec.containers[0].ports[0].containerPort).toBe(8080);

    const svcArg = firstCallArg(clients.core.createNamespacedService) as {
      body: { spec: { ports: { port: number; targetPort: number }[] } };
    };
    expect(svcArg.body.spec.ports[0].port).toBe(8080);
    expect(svcArg.body.spec.ports[0].targetPort).toBe(8080);
  });

  test('derives the dashboard host from a non-URL endpoint (fallback path)', async () => {
    const clients = makeClients();
    const result = await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [makeNode('web-a')],
      services: [makeService()],
      endpoint: 'my-cluster-host',
    });
    expect(result.services[0].dashboardUrl).toBe('http://my-cluster-host:31567');
  });

  test('omits the dashboard url when the service has no assigned nodePort', async () => {
    const clients = makeClients();
    clients.core.createNamespacedService = vi.fn(async () => ({
      spec: { ports: [{}] },
    })) as unknown as typeof clients.core.createNamespacedService;
    const result = await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [makeNode('web-a')],
      services: [makeService()],
      endpoint: 'https://10.0.0.1:6443',
    });
    expect(result.services[0].nodePort).toBeUndefined();
    expect(result.services[0].dashboardUrl).toBeUndefined();
  });

  test('surfaces a Kubernetes API failure as AppError(502)', async () => {
    const clients = makeClients();
    clients.core.createNamespace = vi.fn(async () => {
      throw new ApiException(403, 'forbidden', { message: 'access denied' });
    });

    try {
      await deployTopology(clients as never, {
        namespace: 'secsim-a-b',
        nodes: [makeNode('web-a')],
        services: [makeService()],
        endpoint: 'https://10.0.0.1:6443',
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(502);
    }
  });
});

describe('deployTopology — sidecar grouping (issue #191)', () => {
  const SIDECAR_ID = '507f1f77bcf86cd799439012';
  const HOST_ID = '507f1f77bcf86cd799439011';
  type DeploymentSpec = NonNullable<ServiceImageSource['deployment']>;

  function hostService(overrides: Partial<DeploymentSpec> = {}): ServiceImageSource {
    return makeService({
      _id: HOST_ID,
      deployment: {
        kind: 'Deployment',
        role: 'target',
        containerPort: 8080,
        exposePort: true,
        ...overrides,
      },
    });
  }

  function sidecarService(
    id: string,
    deployment: Partial<DeploymentSpec> = {}
  ): ServiceImageSource {
    return makeService({
      _id: id,
      deployment: {
        kind: 'Deployment',
        role: 'monitor',
        attachMode: 'sidecar',
        exposePort: false,
        ...deployment,
      },
    });
  }

  function sidecarNode(id: string, serviceId = SIDECAR_ID): unknown {
    return { id, data: { serviceId } };
  }

  function hostNode(id = 'http-sim'): unknown {
    return { id, data: { serviceId: HOST_ID } };
  }

  interface DeploymentBody {
    body: {
      spec: {
        template: {
          spec: {
            containers: {
              name: string;
              securityContext?: { capabilities?: { add?: string[] } };
              volumeMounts?: { name: string; mountPath: string }[];
            }[];
            volumes?: { name: string; emptyDir?: object }[];
          };
        };
      };
    };
  }

  function deploymentBody(clients: ReturnType<typeof makeClients>): DeploymentBody['body'] {
    return (firstCallArg(clients.apps.createNamespacedDeployment) as DeploymentBody).body;
  }

  test('injects a sidecar node as an extra container in the host Deployment', async () => {
    const clients = makeClients();
    const result = await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [hostNode(), sidecarNode('mmt-probe')],
      edges: [{ source: 'mmt-probe', target: 'http-sim', type: 'monitors' }],
      services: [hostService(), sidecarService(SIDECAR_ID)],
      endpoint: 'https://10.0.0.1:6443',
    });

    // One Deployment for the host only; its pod holds host + sidecar.
    expect(clients.apps.createNamespacedDeployment).toHaveBeenCalledTimes(1);
    const podSpec = deploymentBody(clients).spec.template.spec;
    expect(podSpec.containers.map((c) => c.name)).toEqual(['http-sim', 'mmt-probe']);

    // The sidecar produces no Service and no Deployment of its own.
    expect(clients.core.createNamespacedService).toHaveBeenCalledTimes(1);
    expect(
      (
        firstCallArg(clients.core.createNamespacedService) as {
          body: { metadata: { name: string } };
        }
      ).body.metadata.name
    ).toBe('http-sim');

    // Still one result row per node; the sidecar row points at the host's
    // resource name so status/log polling finds the pod it runs in.
    expect(result.services).toHaveLength(2);
    const sidecarRow = result.services.find((s) => s.nodeId === 'mmt-probe');
    expect(sidecarRow?.name).toBe('http-sim');
    expect(sidecarRow?.nodePort).toBeUndefined();
    expect(sidecarRow?.dashboardUrl).toBeUndefined();
  });

  test('adds one container per attached sidecar', async () => {
    const clients = makeClients();
    const SECOND_SIDECAR = '507f1f77bcf86cd799439013';
    await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [hostNode(), sidecarNode('mmt-probe'), sidecarNode('mmt-probe-2', SECOND_SIDECAR)],
      edges: [
        { source: 'mmt-probe', target: 'http-sim', type: 'monitors' },
        { source: 'mmt-probe-2', target: 'http-sim', type: 'monitors' },
      ],
      services: [hostService(), sidecarService(SIDECAR_ID), sidecarService(SECOND_SIDECAR)],
      endpoint: 'https://10.0.0.1:6443',
    });

    const podSpec = deploymentBody(clients).spec.template.spec;
    expect(podSpec.containers.map((c) => c.name)).toEqual(['http-sim', 'mmt-probe', 'mmt-probe-2']);
  });

  test('applies the sidecar securityContext only to its own container', async () => {
    const clients = makeClients();
    await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [hostNode(), sidecarNode('mmt-probe')],
      edges: [{ source: 'mmt-probe', target: 'http-sim', type: 'monitors' }],
      services: [
        hostService(),
        sidecarService(SIDECAR_ID, {
          securityContext: { capabilities: ['NET_ADMIN', 'NET_RAW'] },
        }),
      ],
      endpoint: 'https://10.0.0.1:6443',
    });

    const [host, sidecar] = deploymentBody(clients).spec.template.spec.containers;
    expect(host.securityContext).toBeUndefined();
    expect(sidecar.securityContext?.capabilities?.add).toEqual(['NET_ADMIN', 'NET_RAW']);
  });

  test('shares a sidecar emptyDir volume between host and sidecar containers', async () => {
    const clients = makeClients();
    await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [hostNode(), sidecarNode('mmt-probe')],
      edges: [{ source: 'mmt-probe', target: 'http-sim', type: 'monitors' }],
      services: [
        hostService(),
        sidecarService(SIDECAR_ID, {
          volumes: [{ name: 'mmt-reports', mountPath: '/opt/mmt/reports', emptyDir: true }],
        }),
      ],
      endpoint: 'https://10.0.0.1:6443',
    });

    const podSpec = deploymentBody(clients).spec.template.spec;
    expect(podSpec.volumes).toEqual([{ name: 'mmt-reports', emptyDir: {} }]);
    for (const container of podSpec.containers) {
      expect(container.volumeMounts).toContainEqual({
        name: 'mmt-reports',
        mountPath: '/opt/mmt/reports',
      });
    }
  });

  test('follows a monitor edge chain when the monitored node is itself a sidecar', async () => {
    const clients = makeClients();
    const SECOND_SIDECAR = '507f1f77bcf86cd799439013';
    await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [hostNode(), sidecarNode('inner'), sidecarNode('outer', SECOND_SIDECAR)],
      edges: [
        { source: 'inner', target: 'http-sim', type: 'monitors' },
        { source: 'outer', target: 'inner', type: 'monitors' },
      ],
      services: [hostService(), sidecarService(SIDECAR_ID), sidecarService(SECOND_SIDECAR)],
      endpoint: 'https://10.0.0.1:6443',
    });

    const podSpec = deploymentBody(clients).spec.template.spec;
    expect(podSpec.containers.map((c) => c.name)).toEqual(['http-sim', 'inner', 'outer']);
    expect(clients.apps.createNamespacedDeployment).toHaveBeenCalledTimes(1);
  });

  test('fails deploy with a 400 naming the node when a sidecar has no monitor edge', async () => {
    const clients = makeClients();
    try {
      await deployTopology(clients as never, {
        namespace: 'secsim-a-b',
        nodes: [hostNode(), sidecarNode('mmt-probe')],
        edges: [],
        services: [hostService(), sidecarService(SIDECAR_ID)],
        endpoint: 'https://10.0.0.1:6443',
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
      expect((err as AppError).message).toContain('mmt-probe');
    }
    // The 400 fires before any cluster call — nothing is created or torn down.
    expect(clients.core.createNamespace).not.toHaveBeenCalled();
  });

  test('fails deploy with a 400 on a monitor-edge cycle between sidecars', async () => {
    const clients = makeClients();
    const SECOND_SIDECAR = '507f1f77bcf86cd799439013';
    await expect(
      deployTopology(clients as never, {
        namespace: 'secsim-a-b',
        nodes: [hostNode(), sidecarNode('a-side'), sidecarNode('b-side', SECOND_SIDECAR)],
        edges: [
          { source: 'a-side', target: 'b-side', type: 'monitors' },
          { source: 'b-side', target: 'a-side', type: 'monitors' },
        ],
        services: [hostService(), sidecarService(SIDECAR_ID), sidecarService(SECOND_SIDECAR)],
        endpoint: 'https://10.0.0.1:6443',
      })
    ).rejects.toThrow(AppError);
    expect(clients.core.createNamespace).not.toHaveBeenCalled();
  });
});

describe('deployTopology — Job, ConfigMap and RBAC manifests (issue #192)', () => {
  const NODE_ID = '507f1f77bcf86cd799439011';
  type DeploymentSpec = NonNullable<ServiceImageSource['deployment']>;

  function specService(deployment: Partial<DeploymentSpec>): ServiceImageSource {
    return makeService({ _id: NODE_ID, deployment: deployment as DeploymentSpec });
  }

  function specNode(id: string): unknown {
    return { id, data: { serviceId: NODE_ID } };
  }

  function workloadBody(clients: ReturnType<typeof makeClients>) {
    const jobCall = firstCallArg(clients.batch.createNamespacedJob) as
      { body: { spec: { template: { spec: Record<string, unknown> } } } } | undefined;
    const depCall = firstCallArg(clients.apps.createNamespacedDeployment) as
      { body: { spec: { template: { spec: Record<string, unknown> } } } } | undefined;
    return (jobCall ?? depCall)?.body.spec.template.spec;
  }

  test('a kind:Job node produces a batch/v1 Job and no Service', async () => {
    const clients = makeClients();
    const result = await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [specNode('mag')],
      services: [
        specService({
          kind: 'Job',
          role: 'attack',
          exposePort: false,
          args: ['mag', 'http-get'],
        }),
      ],
      endpoint: 'https://10.0.0.1:6443',
    });

    const jobArg = firstCallArg(clients.batch.createNamespacedJob) as {
      body: {
        spec: {
          template: {
            spec: { restartPolicy?: string; containers: { name: string; args?: string[] }[] };
          };
        };
      };
    };
    expect(jobArg.body.spec.template.spec.restartPolicy).toBe('Never');
    expect(jobArg.body.spec.template.spec.containers[0].name).toBe('mag');
    expect(jobArg.body.spec.template.spec.containers[0].args).toEqual(['mag', 'http-get']);
    // No Deployment and no Service for a Job node.
    expect(clients.apps.createNamespacedDeployment).not.toHaveBeenCalled();
    expect(clients.core.createNamespacedService).not.toHaveBeenCalled();
    expect(result.services[0].nodePort).toBeUndefined();
    expect(result.services[0].dashboardUrl).toBeUndefined();
  });

  test('a standalone Deployment with exposePort:false skips the Service', async () => {
    const clients = makeClients();
    const result = await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [specNode('internal')],
      services: [specService({ kind: 'Deployment', role: 'generic', exposePort: false })],
      endpoint: 'https://10.0.0.1:6443',
    });

    expect(clients.apps.createNamespacedDeployment).toHaveBeenCalledTimes(1);
    expect(clients.core.createNamespacedService).not.toHaveBeenCalled();
    expect(result.services[0].nodePort).toBeUndefined();
  });

  test('configFiles produce a ConfigMap and a matching subPath volume mount', async () => {
    const clients = makeClients();
    await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [specNode('mmt')],
      services: [
        specService({
          kind: 'Deployment',
          role: 'monitor',
          configFiles: [{ mountPath: '/opt/mmt/probe/mmt-probe.conf', content: 'security = {};' }],
        }),
      ],
      endpoint: 'https://10.0.0.1:6443',
    });

    const cmArg = firstCallArg(clients.core.createNamespacedConfigMap) as {
      body: { metadata: { name: string; namespace: string }; data: Record<string, string> };
    };
    expect(cmArg.body.metadata.name).toBe('mmt-config');
    expect(cmArg.body.metadata.namespace).toBe('secsim-a-b');
    expect(cmArg.body.data).toEqual({ 'mmt-probe.conf': 'security = {};' });

    const podSpec = workloadBody(clients) as {
      containers: { volumeMounts?: { name: string; mountPath: string; subPath?: string }[] }[];
      volumes?: { name: string; configMap?: { name: string } }[];
    };
    expect(podSpec.volumes).toContainEqual({
      name: 'mmt-config',
      configMap: { name: 'mmt-config' },
    });
    expect(podSpec.containers[0].volumeMounts).toContainEqual({
      name: 'mmt-config',
      mountPath: '/opt/mmt/probe/mmt-probe.conf',
      subPath: 'mmt-probe.conf',
    });
  });

  test('a sidecar configFiles ConfigMap mounts inside the host pod', async () => {
    const clients = makeClients();
    const SIDE_ID = '507f1f77bcf86cd799439012';
    await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [specNode('http-sim'), { id: 'mmt-probe', data: { serviceId: SIDE_ID } }],
      edges: [{ source: 'mmt-probe', target: 'http-sim', type: 'monitors' }],
      services: [
        specService({ kind: 'Deployment', role: 'target', containerPort: 8080, exposePort: true }),
        makeService({
          _id: SIDE_ID,
          deployment: {
            kind: 'Deployment',
            role: 'monitor',
            attachMode: 'sidecar',
            exposePort: false,
            configFiles: [
              { mountPath: '/opt/mmt/probe/mmt-probe.conf', content: 'security = {};' },
            ],
          },
        }),
      ],
      endpoint: 'https://10.0.0.1:6443',
    });

    // The sidecar's ConfigMap is created and mounted on the sidecar container.
    const cmArg = firstCallArg(clients.core.createNamespacedConfigMap) as {
      body: { metadata: { name: string } };
    };
    expect(cmArg.body.metadata.name).toBe('mmt-probe-config');

    const depArg = firstCallArg(clients.apps.createNamespacedDeployment) as {
      body: {
        spec: {
          template: {
            spec: {
              containers: { name: string; volumeMounts?: { name: string; subPath?: string }[] }[];
              volumes?: { name: string }[];
            };
          };
        };
      };
    };
    const podSpec = depArg.body.spec.template.spec;
    expect(podSpec.volumes).toContainEqual({
      name: 'mmt-probe-config',
      configMap: { name: 'mmt-probe-config' },
    });
    const sidecar = podSpec.containers.find((c) => c.name === 'mmt-probe');
    expect(sidecar?.volumeMounts).toContainEqual({
      name: 'mmt-probe-config',
      mountPath: '/opt/mmt/probe/mmt-probe.conf',
      subPath: 'mmt-probe.conf',
    });
  });

  test('rbac rules produce a ServiceAccount, a namespaced Role and a RoleBinding', async () => {
    const clients = makeClients();
    const rules = [
      { apiGroups: [''], resources: ['pods'], verbs: ['delete'] },
      {
        apiGroups: ['apps'],
        resources: ['deployments', 'deployments/scale'],
        verbs: ['patch', 'update'],
      },
      {
        apiGroups: ['networking.k8s.io'],
        resources: ['networkpolicies'],
        verbs: ['create'],
      },
    ];
    await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [specNode('ai4soar')],
      services: [
        specService({
          kind: 'Deployment',
          role: 'reaction',
          containerPort: 5000,
          exposePort: true,
          rbac: rules,
        }),
      ],
      endpoint: 'https://10.0.0.1:6443',
    });

    const saArg = firstCallArg(clients.core.createNamespacedServiceAccount) as {
      body: { metadata: { name: string; namespace: string } };
    };
    expect(saArg.body.metadata.name).toBe('ai4soar');
    expect(saArg.body.metadata.namespace).toBe('secsim-a-b');

    const roleArg = firstCallArg(clients.rbac.createNamespacedRole) as {
      body: { metadata: { name: string; namespace: string }; rules: typeof rules };
    };
    expect(roleArg.body.metadata.name).toBe('ai4soar');
    expect(roleArg.body.metadata.namespace).toBe('secsim-a-b');
    expect(roleArg.body.rules).toEqual(rules);

    const rbArg = firstCallArg(clients.rbac.createNamespacedRoleBinding) as {
      body: {
        metadata: { name: string; namespace: string };
        roleRef: { apiGroup: string; kind: string; name: string };
        subjects: { kind: string; name: string; namespace: string }[];
      };
    };
    expect(rbArg.body.metadata.name).toBe('ai4soar');
    expect(rbArg.body.roleRef).toEqual({
      apiGroup: 'rbac.authorization.k8s.io',
      kind: 'Role',
      name: 'ai4soar',
    });
    expect(rbArg.body.subjects).toEqual([
      { kind: 'ServiceAccount', name: 'ai4soar', namespace: 'secsim-a-b' },
    ]);

    // The pod runs as that ServiceAccount — and nothing cluster-scoped exists
    // on the fake clients, so a ClusterRole/ClusterRoleBinding call would have
    // failed the deploy outright.
    const podSpec = workloadBody(clients) as { serviceAccountName?: string };
    expect(podSpec.serviceAccountName).toBe('ai4soar');
  });

  test('a Deployment without rbac rules gets no ServiceAccount', async () => {
    const clients = makeClients();
    await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [specNode('plain')],
      services: [specService({ kind: 'Deployment', role: 'generic' })],
      endpoint: 'https://10.0.0.1:6443',
    });
    expect(clients.core.createNamespacedServiceAccount).not.toHaveBeenCalled();
    expect(clients.rbac.createNamespacedRole).not.toHaveBeenCalled();
    expect(clients.rbac.createNamespacedRoleBinding).not.toHaveBeenCalled();
    const podSpec = workloadBody(clients) as { serviceAccountName?: string };
    expect(podSpec.serviceAccountName).toBeUndefined();
  });

  test('a sidecar rbac rule folds into the host pod Role and ServiceAccount', async () => {
    const clients = makeClients();
    const SIDE_ID = '507f1f77bcf86cd799439012';
    const sidecarRules = [{ apiGroups: [''], resources: ['pods'], verbs: ['get', 'list'] }];
    await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [specNode('http-sim'), { id: 'probe', data: { serviceId: SIDE_ID } }],
      edges: [{ source: 'probe', target: 'http-sim', type: 'monitors' }],
      services: [
        specService({ kind: 'Deployment', role: 'target', containerPort: 8080, exposePort: true }),
        makeService({
          _id: SIDE_ID,
          deployment: {
            kind: 'Deployment',
            role: 'monitor',
            attachMode: 'sidecar',
            exposePort: false,
            rbac: sidecarRules,
          },
        }),
      ],
      endpoint: 'https://10.0.0.1:6443',
    });

    // The pod's single ServiceAccount is the host's; its Role carries the
    // sidecar's declared rules (a pod can only bind one account).
    const saArg = firstCallArg(clients.core.createNamespacedServiceAccount) as {
      body: { metadata: { name: string } };
    };
    expect(saArg.body.metadata.name).toBe('http-sim');
    const roleArg = firstCallArg(clients.rbac.createNamespacedRole) as {
      body: { metadata: { name: string }; rules: unknown[] };
    };
    expect(roleArg.body.metadata.name).toBe('http-sim');
    expect(roleArg.body.rules).toEqual(sidecarRules);
    const podSpec = workloadBody(clients) as { serviceAccountName?: string };
    expect(podSpec.serviceAccountName).toBe('http-sim');
  });

  test('declares an HTTP readiness probe from readinessPath', async () => {
    const clients = makeClients();
    await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [specNode('http-sim')],
      services: [
        specService({
          kind: 'Deployment',
          role: 'target',
          containerPort: 8080,
          exposePort: true,
          readinessPath: '/',
        }),
      ],
      endpoint: 'https://10.0.0.1:6443',
    });
    const podSpec = workloadBody(clients) as {
      containers: { readinessProbe?: { httpGet?: { path: string; port: number } } }[];
    };
    expect(podSpec.containers[0].readinessProbe?.httpGet).toEqual({ path: '/', port: 8080 });
  });
});

describe('deployTopology — PodSecurity label and attack containment (issue #194)', () => {
  const TARGET_ID = '507f1f77bcf86cd799439011';
  const ATTACK_ID = '507f1f77bcf86cd799439013';
  const MONITOR_ID = '507f1f77bcf86cd799439014';
  type DeploymentSpec = NonNullable<ServiceImageSource['deployment']>;

  const targetSvc = (id = TARGET_ID) =>
    makeService({
      _id: id,
      deployment: {
        kind: 'Deployment',
        role: 'target',
        containerPort: 8080,
        exposePort: true,
      },
    });
  const attackSvc = (deployment: Partial<DeploymentSpec> = {}) =>
    makeService({
      _id: ATTACK_ID,
      deployment: { kind: 'Job', role: 'attack', exposePort: false, ...deployment },
    });
  const monitorSvc = (deployment: Partial<DeploymentSpec> = {}) =>
    makeService({
      _id: MONITOR_ID,
      deployment: {
        kind: 'Deployment',
        role: 'monitor',
        attachMode: 'sidecar',
        exposePort: false,
        ...deployment,
      },
    });

  const node = (id: string, serviceId: string) => ({ id, data: { serviceId } });

  function namespaceLabels(clients: ReturnType<typeof makeClients>): Record<string, string> {
    const arg = firstCallArg(clients.core.createNamespace) as {
      body: { metadata: { labels?: Record<string, string> } };
    };
    return arg.body.metadata.labels ?? {};
  }

  interface NetworkPolicyBody {
    body: {
      metadata: { name: string; namespace: string; labels?: Record<string, string> };
      spec: {
        podSelector: { matchLabels: Record<string, string> };
        policyTypes: string[];
        egress: {
          to?: { podSelector?: { matchLabels: Record<string, string> } }[];
          ports?: { port: number; protocol: string }[];
        }[];
      };
    };
  }

  function networkPolicyBodies(clients: ReturnType<typeof makeClients>) {
    return (clients.networking.createNamespacedNetworkPolicy.mock.calls as unknown[][]).map(
      (call) => (call[0] as NetworkPolicyBody).body
    );
  }

  test('labels the namespace enforce=privileged when a node declares capabilities', async () => {
    const clients = makeClients();
    await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [node('http-sim', TARGET_ID), node('mag', ATTACK_ID)],
      edges: [{ source: 'mag', target: 'http-sim', type: 'attacks' }],
      services: [
        targetSvc(),
        attackSvc({ securityContext: { capabilities: ['NET_ADMIN', 'NET_RAW'] } }),
      ],
      endpoint: 'https://10.0.0.1:6443',
    });
    expect(namespaceLabels(clients)['pod-security.kubernetes.io/enforce']).toBe('privileged');
  });

  test('a sidecar declaring capabilities still triggers the privileged label', async () => {
    const clients = makeClients();
    await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [node('http-sim', TARGET_ID), node('mmt-probe', MONITOR_ID)],
      edges: [{ source: 'mmt-probe', target: 'http-sim', type: 'monitors' }],
      services: [
        targetSvc(),
        monitorSvc({ securityContext: { capabilities: ['NET_ADMIN', 'NET_RAW'] } }),
      ],
      endpoint: 'https://10.0.0.1:6443',
    });
    expect(namespaceLabels(clients)['pod-security.kubernetes.io/enforce']).toBe('privileged');
  });

  test('hostNetwork triggers the privileged label', async () => {
    const clients = makeClients();
    await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [node('http-sim', TARGET_ID)],
      services: [
        makeService({
          _id: TARGET_ID,
          deployment: { kind: 'Deployment', role: 'target', hostNetwork: true },
        }),
      ],
      endpoint: 'https://10.0.0.1:6443',
    });
    expect(namespaceLabels(clients)['pod-security.kubernetes.io/enforce']).toBe('privileged');
  });

  test('omits the label when no node needs elevated privileges', async () => {
    const clients = makeClients();
    await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [node('http-sim', TARGET_ID), node('web-b', TARGET_ID)],
      services: [targetSvc()],
      endpoint: 'https://10.0.0.1:6443',
    });
    const labels = namespaceLabels(clients);
    expect(labels).not.toHaveProperty('pod-security.kubernetes.io/enforce');
    expect(labels['app.kubernetes.io/managed-by']).toBe('secsim');
  });

  test('an attack node gets an egress NetworkPolicy limited to its target and DNS', async () => {
    const clients = makeClients();
    await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [node('mag', ATTACK_ID), node('http-sim', TARGET_ID)],
      edges: [{ source: 'mag', target: 'http-sim', type: 'attacks' }],
      services: [attackSvc(), targetSvc()],
      endpoint: 'https://10.0.0.1:6443',
    });

    expect(clients.networking.createNamespacedNetworkPolicy).toHaveBeenCalledTimes(1);
    const policy = networkPolicyBodies(clients)[0];
    expect(policy.metadata.name).toBe('mag-egress');
    expect(policy.metadata.namespace).toBe('secsim-a-b');
    expect(policy.spec.podSelector).toEqual({ matchLabels: { app: 'mag' } });
    expect(policy.spec.policyTypes).toEqual(['Egress']);
    // One rule per attack target, then the DNS rule.
    expect(policy.spec.egress).toHaveLength(2);
    expect(policy.spec.egress[0].to).toEqual([
      { podSelector: { matchLabels: { app: 'http-sim' } } },
    ]);
    expect(policy.spec.egress[0].ports).toEqual([{ port: 8080, protocol: 'TCP' }]);
    expect(policy.spec.egress[1].to).toBeUndefined();
    expect(policy.spec.egress[1].ports).toEqual([
      { port: 53, protocol: 'UDP' },
      { port: 53, protocol: 'TCP' },
    ]);
  });

  test('every attack-edge target gets its own egress rule', async () => {
    const clients = makeClients();
    const TARGET2_ID = '507f1f77bcf86cd799439015';
    await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [node('mag', ATTACK_ID), node('t1', TARGET_ID), node('t2', TARGET2_ID)],
      edges: [
        { source: 'mag', target: 't1', type: 'attacks' },
        { source: 'mag', target: 't2', type: 'attacks' },
      ],
      services: [attackSvc(), targetSvc(), targetSvc(TARGET2_ID)],
      endpoint: 'https://10.0.0.1:6443',
    });

    const policy = networkPolicyBodies(clients)[0];
    // Two target rules + the DNS rule.
    expect(policy.spec.egress).toHaveLength(3);
    expect(policy.spec.egress[0].to).toEqual([{ podSelector: { matchLabels: { app: 't1' } } }]);
    expect(policy.spec.egress[1].to).toEqual([{ podSelector: { matchLabels: { app: 't2' } } }]);
    expect(policy.spec.egress[2].ports).toEqual([
      { port: 53, protocol: 'UDP' },
      { port: 53, protocol: 'TCP' },
    ]);
  });

  test('an attack node with no attack edge gets a DNS-only containment policy', async () => {
    const clients = makeClients();
    await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [node('mag', ATTACK_ID)],
      edges: [],
      services: [attackSvc()],
      endpoint: 'https://10.0.0.1:6443',
    });

    const policy = networkPolicyBodies(clients)[0];
    expect(policy.spec.podSelector).toEqual({ matchLabels: { app: 'mag' } });
    expect(policy.spec.egress).toHaveLength(1);
    expect(policy.spec.egress[0].to).toBeUndefined();
    expect(policy.spec.egress[0].ports).toEqual([
      { port: 53, protocol: 'UDP' },
      { port: 53, protocol: 'TCP' },
    ]);
  });

  test('a non-attack topology creates no NetworkPolicy', async () => {
    const clients = makeClients();
    await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [node('http-sim', TARGET_ID), node('mmt-probe', MONITOR_ID)],
      edges: [{ source: 'mmt-probe', target: 'http-sim', type: 'monitors' }],
      services: [targetSvc(), monitorSvc()],
      endpoint: 'https://10.0.0.1:6443',
    });
    expect(clients.networking.createNamespacedNetworkPolicy).not.toHaveBeenCalled();
  });

  test('an attack sidecar is contained by a policy on the pod it runs in', async () => {
    const clients = makeClients();
    await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [node('http-sim', TARGET_ID), node('mag-side', ATTACK_ID)],
      edges: [
        // attachMode 'sidecar' rides on the pod its monitor edge points at.
        { source: 'mag-side', target: 'http-sim', type: 'monitors' },
        { source: 'mag-side', target: 'http-sim', type: 'attacks' },
      ],
      services: [targetSvc(), attackSvc({ kind: 'Deployment', attachMode: 'sidecar' })],
      endpoint: 'https://10.0.0.1:6443',
    });

    const policy = networkPolicyBodies(clients)[0];
    // Named after the attack node but selecting the host pod it rides in.
    expect(policy.metadata.name).toBe('mag-side-egress');
    expect(policy.spec.podSelector).toEqual({ matchLabels: { app: 'http-sim' } });
    expect(policy.spec.egress[0].to).toEqual([
      { podSelector: { matchLabels: { app: 'http-sim' } } },
    ]);
  });
});

describe('edge-derived environment variables (issue #193)', () => {
  const TARGET_ID = '507f1f77bcf86cd799439011';
  const REACTION_ID = '507f1f77bcf86cd799439012';
  const ATTACK_ID = '507f1f77bcf86cd799439013';
  const MONITOR_ID = '507f1f77bcf86cd799439014';
  type DeploymentSpec = NonNullable<ServiceImageSource['deployment']>;
  type EnvEntry = NonNullable<DeploymentSpec['env']>[number];

  const targetSvc = () =>
    makeService({
      _id: TARGET_ID,
      deployment: {
        kind: 'Deployment',
        role: 'target',
        containerPort: 8080,
        exposePort: true,
      },
    });
  const reactionSvc = () =>
    makeService({
      _id: REACTION_ID,
      deployment: {
        kind: 'Deployment',
        role: 'reaction',
        containerPort: 5000,
        exposePort: true,
      },
    });
  const attackSvc = (env: EnvEntry[]) =>
    makeService({
      _id: ATTACK_ID,
      deployment: { kind: 'Job', role: 'attack', exposePort: false, env },
    });
  const monitorSvc = (env: EnvEntry[]) =>
    makeService({
      _id: MONITOR_ID,
      deployment: { kind: 'Deployment', role: 'monitor', exposePort: false, env },
    });

  const node = (id: string, serviceId: string, config?: unknown) => ({
    id,
    data: { serviceId, ...(config ? { config } : {}) },
  });

  test("fromEdge 'target' resolves to http://<attack-target>:<port>", () => {
    const resolved = resolveTopologyNodes(
      [node('mag', ATTACK_ID), node('http-sim', TARGET_ID)],
      [attackSvc([{ name: 'TARGET_URL', fromEdge: 'target' }]), targetSvc()],
      [{ source: 'mag', target: 'http-sim', type: 'attacks' }]
    );
    expect(resolved[0].deployment.env).toEqual([
      { name: 'TARGET_URL', fromEdge: 'target', value: 'http://http-sim:8080' },
    ]);
  });

  test("fromEdge 'reaction' resolves to http://<notify-target>:<port>", () => {
    const resolved = resolveTopologyNodes(
      [node('mmt-probe', MONITOR_ID), node('ai4soar', REACTION_ID)],
      [monitorSvc([{ name: 'ALERT_WEBHOOK_URL', fromEdge: 'reaction' }]), reactionSvc()],
      [{ source: 'mmt-probe', target: 'ai4soar', type: 'notifies' }]
    );
    expect(resolved[0].deployment.env).toEqual([
      { name: 'ALERT_WEBHOOK_URL', fromEdge: 'reaction', value: 'http://ai4soar:5000' },
    ]);
  });

  test('resolved env lands on the deployed container', async () => {
    const clients = makeClients();
    await deployTopology(clients as never, {
      namespace: 'secsim-a-b',
      nodes: [node('mag', ATTACK_ID), node('http-sim', TARGET_ID)],
      edges: [{ source: 'mag', target: 'http-sim', type: 'attacks' }],
      services: [attackSvc([{ name: 'TARGET_URL', fromEdge: 'target' }]), targetSvc()],
      endpoint: 'https://10.0.0.1:6443',
    });
    const jobArg = firstCallArg(clients.batch.createNamespacedJob) as {
      body: {
        spec: { template: { spec: { containers: { env?: { name: string; value: string }[] }[] } } };
      };
    };
    expect(jobArg.body.spec.template.spec.containers[0].env).toEqual([
      { name: 'TARGET_URL', value: 'http://http-sim:8080' },
    ]);
  });

  test('a fromEdge target env with no attack edge fails with a 400 naming the node', () => {
    expect(() =>
      resolveTopologyNodes(
        [node('mag', ATTACK_ID), node('http-sim', TARGET_ID)],
        [attackSvc([{ name: 'TARGET_URL', fromEdge: 'target' }]), targetSvc()],
        []
      )
    ).toThrow(AppError);
    try {
      resolveTopologyNodes(
        [node('mag', ATTACK_ID), node('http-sim', TARGET_ID)],
        [attackSvc([{ name: 'TARGET_URL', fromEdge: 'target' }]), targetSvc()],
        []
      );
      expect.unreachable();
    } catch (err) {
      expect((err as AppError).statusCode).toBe(400);
      expect((err as AppError).message).toContain('mag');
      expect((err as AppError).message).toContain('target');
    }
  });

  test('a fromEdge reaction env with no notify edge fails with a 400 naming the node', () => {
    try {
      resolveTopologyNodes(
        [node('mmt-probe', MONITOR_ID), node('ai4soar', REACTION_ID)],
        [monitorSvc([{ name: 'ALERT_WEBHOOK_URL', fromEdge: 'reaction' }]), reactionSvc()],
        // An unrelated edge does not satisfy the requirement.
        [{ source: 'mmt-probe', target: 'ai4soar', type: 'attacks' }]
      );
      expect.unreachable();
    } catch (err) {
      expect((err as AppError).statusCode).toBe(400);
      expect((err as AppError).message).toContain('mmt-probe');
      expect((err as AppError).message).toContain('reaction');
    }
  });

  test('a node-level config.env literal overrides the catalog fromEdge entry', () => {
    const resolved = resolveTopologyNodes(
      [
        node('mag', ATTACK_ID, {
          env: [{ name: 'TARGET_URL', value: 'http://custom-target:1234' }],
        }),
        node('http-sim', TARGET_ID),
      ],
      [attackSvc([{ name: 'TARGET_URL', fromEdge: 'target' }]), targetSvc()],
      // No attack edge — the literal override wins outright.
      []
    );
    expect(resolved[0].deployment.env).toEqual([
      { name: 'TARGET_URL', value: 'http://custom-target:1234' },
    ]);
  });

  test('a node-level config.env fromEdge entry also resolves against the edges', () => {
    const resolved = resolveTopologyNodes(
      [
        node('mag', ATTACK_ID, { env: [{ name: 'TARGET_URL', fromEdge: 'target' }] }),
        node('http-sim', TARGET_ID),
      ],
      [attackSvc([]), targetSvc()],
      [{ source: 'mag', target: 'http-sim', type: 'attacks' }]
    );
    expect(resolved[0].deployment.env).toEqual([
      { name: 'TARGET_URL', fromEdge: 'target', value: 'http://http-sim:8080' },
    ]);
  });

  test('literal catalog env passes through unchanged', () => {
    const resolved = resolveTopologyNodes(
      [node('mmt-probe', MONITOR_ID)],
      [monitorSvc([{ name: 'HOST_INTERFACE', value: 'eth0' }])],
      []
    );
    expect(resolved[0].deployment.env).toEqual([{ name: 'HOST_INTERFACE', value: 'eth0' }]);
  });
});

describe('getDeploymentStatus — Job workloads (issue #192)', () => {
  function jobClients(job: unknown) {
    return {
      core: { listNamespacedPod: vi.fn(async () => ({ items: [] })) },
      apps: {
        readNamespacedDeployment: vi.fn(async () => {
          throw new ApiException(404, 'no deployment');
        }),
      },
      batch: { readNamespacedJob: vi.fn(async () => job) },
    };
  }

  test('reports a completed Job as running', async () => {
    const clients = jobClients({
      status: { succeeded: 1, conditions: [{ type: 'Complete', status: 'True' }] },
    });
    const { statuses } = await getDeploymentStatus(clients as never, {
      namespace: 'secsim-a-b',
      names: ['mag'],
    });
    expect(statuses).toEqual([{ name: 'mag', status: 'running' }]);
  });

  test('reports a Job past its backoffLimit as failed', async () => {
    const clients = jobClients({ spec: { backoffLimit: 2 }, status: { failed: 2 } });
    const { statuses } = await getDeploymentStatus(clients as never, {
      namespace: 'secsim-a-b',
      names: ['mag'],
    });
    expect(statuses).toEqual([{ name: 'mag', status: 'failed' }]);
  });

  test('reports a Job Failed condition as failed', async () => {
    const clients = jobClients({ status: { conditions: [{ type: 'Failed', status: 'True' }] } });
    const { statuses } = await getDeploymentStatus(clients as never, {
      namespace: 'secsim-a-b',
      names: ['mag'],
    });
    expect(statuses).toEqual([{ name: 'mag', status: 'failed' }]);
  });

  test('reports a Job whose pod failed as failed even before backoffLimit', async () => {
    const clients = jobClients({ spec: { backoffLimit: 6 }, status: {} });
    clients.core.listNamespacedPod = vi.fn(async () => ({
      items: [{ metadata: { labels: { app: 'mag' } }, status: { phase: 'Failed' } }],
    }));
    const { statuses } = await getDeploymentStatus(clients as never, {
      namespace: 'secsim-a-b',
      names: ['mag'],
    });
    expect(statuses).toEqual([{ name: 'mag', status: 'failed' }]);
  });

  test('reports a Job with a running pod as running', async () => {
    const clients = jobClients({ status: {} });
    clients.core.listNamespacedPod = vi.fn(async () => ({
      items: [{ metadata: { labels: { app: 'mag' } }, status: { phase: 'Running' } }],
    }));
    const { statuses } = await getDeploymentStatus(clients as never, {
      namespace: 'secsim-a-b',
      names: ['mag'],
    });
    expect(statuses).toEqual([{ name: 'mag', status: 'running' }]);
  });

  test('reports an in-flight Job with no pods yet as pending', async () => {
    const clients = jobClients({ status: {} });
    const { statuses } = await getDeploymentStatus(clients as never, {
      namespace: 'secsim-a-b',
      names: ['mag'],
    });
    expect(statuses).toEqual([{ name: 'mag', status: 'pending' }]);
  });
});

describe('getDeploymentStatus', () => {
  test('reports running/failed per service and computes progress', async () => {
    const clients = {
      core: {
        listNamespacedPod: vi.fn(async () => ({
          items: [
            {
              metadata: { labels: { app: 'broken' } },
              status: {
                phase: 'Pending',
                containerStatuses: [{ state: { waiting: { reason: 'ImagePullBackOff' } } }],
              },
            },
          ],
        })),
      },
      apps: {
        readNamespacedDeployment: vi.fn(async ({ name }: { name: string }) =>
          name === 'ready'
            ? { spec: { replicas: 1 }, status: { availableReplicas: 1 } }
            : { spec: { replicas: 1 }, status: { availableReplicas: 0 } }
        ),
      },
    };

    const { statuses, progress } = await getDeploymentStatus(clients as never, {
      namespace: 'secsim-a-b',
      names: ['ready', 'broken'],
    });

    expect(statuses).toEqual([
      { name: 'ready', status: 'running' },
      { name: 'broken', status: 'failed' },
    ]);
    expect(progress).toBe(50);
  });

  test('uses a single listNamespacedPod call per tick with combined selector', async () => {
    const listNamespacedPod = vi.fn(async () => ({
      items: [
        { metadata: { labels: { app: 'svc-a' } }, status: { phase: 'Running' } },
        { metadata: { labels: { app: 'svc-b' } }, status: { phase: 'Pending' } },
      ],
    }));
    const clients = {
      core: { listNamespacedPod },
      apps: {
        readNamespacedDeployment: vi.fn(async () => ({
          spec: { replicas: 1 },
          status: { availableReplicas: 1 },
        })),
      },
    };

    await getDeploymentStatus(clients as never, {
      namespace: 'secsim-a-b',
      names: ['svc-a', 'svc-b', 'svc-c'],
    });

    // Only ONE listNamespacedPod call despite 3 services.
    expect(listNamespacedPod).toHaveBeenCalledTimes(1);
    const callOpts = (
      listNamespacedPod.mock.calls[0] as [{ namespace: string; labelSelector: string }]
    )[0];
    expect(callOpts.labelSelector).toContain('app in (svc-a,svc-b,svc-c)');
  });

  test('detects failed pods from the batch query', async () => {
    const listNamespacedPod = vi.fn(async () => ({
      items: [{ metadata: { labels: { app: 'svc-a' } }, status: { phase: 'Failed' } }],
    }));
    const clients = {
      core: { listNamespacedPod },
      apps: {
        readNamespacedDeployment: vi.fn(async () => ({
          spec: { replicas: 1 },
          status: { availableReplicas: 0 },
        })),
      },
    };

    const { statuses } = await getDeploymentStatus(clients as never, {
      namespace: 'secsim-a-b',
      names: ['svc-a'],
    });

    // Only ONE listNamespacedPod call despite availableReplicas=0 (batch pods used).
    expect(listNamespacedPod).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual([{ name: 'svc-a', status: 'failed' }]);
  });

  test('reports failed when a pod has reached the Failed phase', async () => {
    const clients = {
      core: {
        listNamespacedPod: vi.fn(async () => ({ items: [{ status: { phase: 'Failed' } }] })),
      },
      apps: {
        readNamespacedDeployment: vi.fn(async () => ({
          spec: { replicas: 1 },
          status: { availableReplicas: 0 },
        })),
      },
    };

    const { statuses, progress } = await getDeploymentStatus(clients as never, {
      namespace: 'secsim-a-b',
      names: ['boom'],
    });
    expect(statuses).toEqual([{ name: 'boom', status: 'failed' }]);
    expect(progress).toBe(0);
  });

  test('reports pending while a deployment has no available replicas and healthy pods', async () => {
    const clients = {
      core: {
        listNamespacedPod: vi.fn(async () => ({
          items: [{ status: { phase: 'Pending', containerStatuses: [{ state: {} }] } }],
        })),
      },
      apps: {
        readNamespacedDeployment: vi.fn(async () => ({
          spec: { replicas: 1 },
          status: { availableReplicas: 0 },
        })),
      },
    };

    const { statuses, progress } = await getDeploymentStatus(clients as never, {
      namespace: 'secsim-a-b',
      names: ['warming-up'],
    });
    expect(statuses).toEqual([{ name: 'warming-up', status: 'pending' }]);
    expect(progress).toBe(0);
  });

  test('surfaces a non-404 status read failure as AppError(502)', async () => {
    const clients = {
      core: { listNamespacedPod: vi.fn(async () => ({ items: [] })) },
      apps: {
        readNamespacedDeployment: vi.fn(async () => {
          throw new ApiException(500, 'boom');
        }),
      },
    };
    try {
      await getDeploymentStatus(clients as never, { namespace: 'secsim-a-b', names: ['x'] });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(502);
    }
  });

  test('treats a not-found deployment as pending', async () => {
    const clients = {
      core: { listNamespacedPod: vi.fn(async () => ({ items: [] })) },
      apps: {
        readNamespacedDeployment: vi.fn(async () => {
          throw new ApiException(404, 'not found');
        }),
      },
      batch: {
        readNamespacedJob: vi.fn(async () => {
          throw new ApiException(404, 'not found');
        }),
      },
    };

    const { statuses, progress } = await getDeploymentStatus(clients as never, {
      namespace: 'secsim-a-b',
      names: ['gone'],
    });
    expect(statuses).toEqual([{ name: 'gone', status: 'pending' }]);
    expect(progress).toBe(0);
  });
});

describe('teardownDeployment', () => {
  test('deletes the namespace', async () => {
    const deleteNamespace = vi.fn(async () => ({}));
    await teardownDeployment({ core: { deleteNamespace }, apps: {} } as never, 'secsim-a-b');
    expect(deleteNamespace).toHaveBeenCalledTimes(1);
    expect((firstCallArg(deleteNamespace) as { name: string }).name).toBe('secsim-a-b');
  });

  test('is idempotent when the namespace is already gone (404)', async () => {
    const deleteNamespace = vi.fn(async () => {
      throw new ApiException(404, 'not found');
    });
    await expect(
      teardownDeployment({ core: { deleteNamespace }, apps: {} } as never, 'secsim-a-b')
    ).resolves.toBeUndefined();
  });

  test('surfaces other cluster errors as AppError(502)', async () => {
    const deleteNamespace = vi.fn(async () => {
      throw new ApiException(500, 'boom');
    });
    try {
      await teardownDeployment({ core: { deleteNamespace }, apps: {} } as never, 'secsim-a-b');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(502);
    }
  });
});

describe('isDeploymentSettled', () => {
  test('is settled once every service has left pending', () => {
    expect(isDeploymentSettled([{ status: 'running' }, { status: 'failed' }])).toBe(true);
  });

  test('is not settled while any service is still pending', () => {
    expect(isDeploymentSettled([{ status: 'running' }, { status: 'pending' }])).toBe(false);
  });

  test('treats an empty deployment as trivially settled', () => {
    expect(isDeploymentSettled([])).toBe(true);
  });
});

describe('collectNewPodLogs', () => {
  test('emits only unseen lines, tagged by service and pod', async () => {
    let log = 'line-1\nline-2\n';
    const clients = {
      core: {
        listNamespacedPod: vi.fn(async () => ({ items: [{ metadata: { name: 'svc-a-pod' } }] })),
        readNamespacedPodLog: vi.fn(async () => log),
      },
      apps: {},
    };
    const seen = new Map<string, number>();

    const first = await collectNewPodLogs(clients as never, {
      namespace: 'ns',
      names: ['svc-a'],
      seen,
    });
    expect(first).toEqual([
      { name: 'svc-a', pod: 'svc-a-pod', line: 'line-1' },
      { name: 'svc-a', pod: 'svc-a-pod', line: 'line-2' },
    ]);

    // A subsequent poll surfaces only the newly appended line.
    log = 'line-1\nline-2\nline-3\n';
    const second = await collectNewPodLogs(clients as never, {
      namespace: 'ns',
      names: ['svc-a'],
      seen,
    });
    expect(second).toEqual([{ name: 'svc-a', pod: 'svc-a-pod', line: 'line-3' }]);
  });

  test('skips a pod that is not yet ready to serve logs (400/404)', async () => {
    const clients = {
      core: {
        listNamespacedPod: vi.fn(async () => ({ items: [{ metadata: { name: 'p' } }] })),
        readNamespacedPodLog: vi.fn(async () => {
          throw new ApiException(400, 'container is waiting to start');
        }),
      },
      apps: {},
    };
    const out = await collectNewPodLogs(clients as never, {
      namespace: 'ns',
      names: ['svc-a'],
      seen: new Map(),
    });
    expect(out).toEqual([]);
  });

  test('skips a pod whose logs have already been removed (404)', async () => {
    const clients = {
      core: {
        listNamespacedPod: vi.fn(async () => ({ items: [{ metadata: { name: 'p' } }] })),
        readNamespacedPodLog: vi.fn(async () => {
          throw new ApiException(404, 'pod not found');
        }),
      },
      apps: {},
    };
    const out = await collectNewPodLogs(clients as never, {
      namespace: 'ns',
      names: ['svc-a'],
      seen: new Map(),
    });
    expect(out).toEqual([]);
  });

  test('emits a final line that has no trailing newline', async () => {
    const clients = {
      core: {
        listNamespacedPod: vi.fn(async () => ({ items: [{ metadata: { name: 'svc-a-pod' } }] })),
        readNamespacedPodLog: vi.fn(async () => 'only-line'),
      },
      apps: {},
    };
    const out = await collectNewPodLogs(clients as never, {
      namespace: 'ns',
      names: ['svc-a'],
      seen: new Map(),
    });
    expect(out).toEqual([{ name: 'svc-a', pod: 'svc-a-pod', line: 'only-line' }]);
  });

  test('ignores pods without a metadata name', async () => {
    const clients = {
      core: {
        listNamespacedPod: vi.fn(async () => ({ items: [{ metadata: {} }] })),
        readNamespacedPodLog: vi.fn(async () => 'unreachable'),
      },
      apps: {},
    };
    const out = await collectNewPodLogs(clients as never, {
      namespace: 'ns',
      names: ['svc-a'],
      seen: new Map(),
    });
    expect(out).toEqual([]);
    expect(clients.core.readNamespacedPodLog).not.toHaveBeenCalled();
  });

  test('wraps an unexpected cluster error as AppError(502)', async () => {
    const clients = {
      core: {
        listNamespacedPod: vi.fn(async () => {
          throw new ApiException(500, 'boom');
        }),
        readNamespacedPodLog: vi.fn(async () => ''),
      },
      apps: {},
    };
    try {
      await collectNewPodLogs(clients as never, {
        namespace: 'ns',
        names: ['svc-a'],
        seen: new Map(),
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(502);
    }
  });
});

describe('pingCluster', () => {
  test('resolves when the cluster answers a namespace listing', async () => {
    const listNamespace = vi.fn(async () => ({ items: [] }));
    await expect(
      pingCluster({ core: { listNamespace }, apps: {} } as never)
    ).resolves.toBeUndefined();
    expect(listNamespace).toHaveBeenCalledTimes(1);
  });

  test('wraps a transport/auth failure as AppError', async () => {
    const listNamespace = vi.fn(async () => {
      throw new Error('ECONNREFUSED 10.0.0.1:6443');
    });
    try {
      await pingCluster({ core: { listNamespace }, apps: {} } as never);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
    }
  });
});

describe('buildClientFromInfrastructure', () => {
  beforeEach(() => {
    kubeconfigCalls.fromString = [];
    kubeconfigCalls.fromOptions = [];
    kubeconfigCalls.throwOnLoad = false;
  });

  function infra(credential: string, endpoint = 'https://10.0.0.1:6443'): IInfrastructure {
    return {
      endpoint,
      credentials: encrypt(credential),
    } as unknown as IInfrastructure;
  }

  test('loads kubeconfig content directly', () => {
    buildClientFromInfrastructure(infra('apiVersion: v1\nclusters: []'));
    expect(kubeconfigCalls.fromString).toHaveLength(1);
    expect(kubeconfigCalls.fromOptions).toHaveLength(0);
  });

  test('loads JSON-shaped kubeconfig content directly', () => {
    buildClientFromInfrastructure(infra('{"apiVersion":"v1","clusters":[]}'));
    expect(kubeconfigCalls.fromString).toHaveLength(1);
    expect(kubeconfigCalls.fromOptions).toHaveLength(0);
  });

  test('treats content mentioning clusters: as kubeconfig even without a leading key', () => {
    buildClientFromInfrastructure(infra('# my cluster\nclusters:\n- name: c'));
    expect(kubeconfigCalls.fromString).toHaveLength(1);
    expect(kubeconfigCalls.fromOptions).toHaveLength(0);
  });

  test('wraps a malformed kubeconfig parse failure in an AppError(500)', () => {
    kubeconfigCalls.throwOnLoad = true;
    try {
      buildClientFromInfrastructure(infra('apiVersion: v1\n\tbad: indent'));
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(500);
    }
  });

  test('builds a token-based config from a bearer token credential', () => {
    buildClientFromInfrastructure(infra('a-bearer-token-value'));
    expect(kubeconfigCalls.fromString).toHaveLength(0);
    expect(kubeconfigCalls.fromOptions).toHaveLength(1);
    const opts = kubeconfigCalls.fromOptions[0] as {
      clusters: { server: string }[];
      users: { token: string }[];
    };
    expect(opts.clusters[0].server).toBe('https://10.0.0.1:6443');
    expect(opts.users[0].token).toBe('a-bearer-token-value');
  });

  test('returns core, apps, batch, networking and rbac clients', () => {
    const clients = buildClientFromInfrastructure(infra('apiVersion: v1\nclusters: []'));
    expect(clients.core).toBeInstanceOf(CoreV1Api);
    expect(clients.apps).toBeInstanceOf(AppsV1Api);
    expect(clients.batch).toBeInstanceOf(BatchV1Api);
    expect(clients.networking).toBeInstanceOf(NetworkingV1Api);
    expect(clients.rbac).toBeInstanceOf(RbacAuthorizationV1Api);
  });
});
