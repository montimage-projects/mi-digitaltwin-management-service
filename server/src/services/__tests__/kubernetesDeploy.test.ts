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

const { kubeconfigCalls, CoreV1Api, AppsV1Api, KubeConfig, ApiException } = vi.hoisted(() => {
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
    makeApiClient(ctor: unknown): unknown {
      return ctor === CoreV1Api ? {} : {};
    }
  }

  return { kubeconfigCalls, CoreV1Api, AppsV1Api, KubeConfig, ApiException };
});

vi.mock('@kubernetes/client-node', () => ({
  KubeConfig,
  CoreV1Api,
  AppsV1Api,
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
      deleteNamespace: vi.fn(async () => ({})),
      listNamespacedPod: vi.fn(async () => ({ items: [] })),
    },
    apps: {
      createNamespacedDeployment: vi.fn(async () => ({})),
      readNamespacedDeployment: vi.fn(async () => ({})),
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
});
