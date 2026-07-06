import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { AppError } from '../../middleware/errorHandler.js';
import { encrypt } from '../../utils/encryption.js';
import type { IInfrastructure } from '../../models/Infrastructure.js';

/**
 * Unit tests for the Kubernetes deploy engine.
 *
 * `@kubernetes/client-node` is fully mocked — there is no cluster in CI/test
 * environments, so the engine is exercised against fake clients only.
 */

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
const kubeconfigCalls: { fromString: string[]; fromOptions: unknown[] } = {
  fromString: [],
  fromOptions: [],
};

class CoreV1Api {}
class AppsV1Api {}

class KubeConfig {
  loadFromString(config: string): void {
    kubeconfigCalls.fromString.push(config);
  }
  loadFromOptions(options: unknown): void {
    kubeconfigCalls.fromOptions.push(options);
  }
  makeApiClient(ctor: unknown): unknown {
    return ctor === CoreV1Api ? {} : {};
  }
}

mock.module('@kubernetes/client-node', () => ({
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
  teardownDeployment,
  buildClientFromInfrastructure,
} = await import('../kubernetesDeploy.js');

type ServiceImageSource = Parameters<typeof resolveTopologyNodes>[1][number];

/** Read the first argument of a bun mock's first call without tuple-type friction. */
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

describe('deployTopology', () => {
  function makeClients() {
    return {
      core: {
        createNamespace: mock(async () => ({})),
        createNamespacedService: mock(async () => ({ spec: { ports: [{ nodePort: 31567 }] } })),
        deleteNamespace: mock(async () => ({})),
        listNamespacedPod: mock(async () => ({ items: [] })),
      },
      apps: {
        createNamespacedDeployment: mock(async () => ({})),
        readNamespacedDeployment: mock(async () => ({})),
      },
    };
  }

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

  test('surfaces a Kubernetes API failure as AppError(502)', async () => {
    const clients = makeClients();
    clients.core.createNamespace = mock(async () => {
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

describe('getDeploymentStatus', () => {
  test('reports running/failed per service and computes progress', async () => {
    const clients = {
      core: {
        listNamespacedPod: mock(async () => ({
          items: [
            {
              status: {
                phase: 'Pending',
                containerStatuses: [{ state: { waiting: { reason: 'ImagePullBackOff' } } }],
              },
            },
          ],
        })),
      },
      apps: {
        readNamespacedDeployment: mock(async ({ name }: { name: string }) =>
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

  test('treats a not-found deployment as pending', async () => {
    const clients = {
      core: { listNamespacedPod: mock(async () => ({ items: [] })) },
      apps: {
        readNamespacedDeployment: mock(async () => {
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
    const deleteNamespace = mock(async () => ({}));
    await teardownDeployment({ core: { deleteNamespace }, apps: {} } as never, 'secsim-a-b');
    expect(deleteNamespace).toHaveBeenCalledTimes(1);
    expect((firstCallArg(deleteNamespace) as { name: string }).name).toBe('secsim-a-b');
  });

  test('is idempotent when the namespace is already gone (404)', async () => {
    const deleteNamespace = mock(async () => {
      throw new ApiException(404, 'not found');
    });
    await expect(
      teardownDeployment({ core: { deleteNamespace }, apps: {} } as never, 'secsim-a-b')
    ).resolves.toBeUndefined();
  });

  test('surfaces other cluster errors as AppError(502)', async () => {
    const deleteNamespace = mock(async () => {
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

describe('buildClientFromInfrastructure', () => {
  beforeEach(() => {
    kubeconfigCalls.fromString = [];
    kubeconfigCalls.fromOptions = [];
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
