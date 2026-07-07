import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/auth-store';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// API functions
export const authApi = {
  login: async (username: string, password: string) => {
    const { data } = await api.post('/auth/login', { username, password });
    return data;
  },
  me: async () => {
    const { data } = await api.get('/auth/me');
    return data;
  },
  logout: async () => {
    const { data } = await api.post('/auth/logout');
    return data;
  },
};

export interface Category {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  deprecated?: boolean;
}

export interface Sector {
  _id: string;
  name: string;
  slug: string;
  category: 'essential' | 'important';
  description?: string;
}

export interface ServiceVersion {
  version: string;
  dockerImage: string;
  releaseNotes?: string;
  releasedAt: string;
}

export interface Service {
  _id: string;
  shortName: string;
  title: string;
  categoryId: Category;
  sectorId?: Sector;
  provider: string;
  description?: string;
  currentVersion?: string;
  versions: ServiceVersion[];
  type: 'Software' | 'Hardware' | 'Software/Hardware';
  uiType: 'web' | 'terminal' | 'both';
  trl: {
    current?: number;
    expected?: number;
  };
  license?: string;
  standards: string[];
  inputs: { name: string; description?: string }[];
  outputs: { name: string; description?: string }[];
  interactsWith: string[];
  potentialUseCases: string[];
  repositoryTable: 'INTACT_TOOLBOX' | 'OTHER_SERVICES';
  deprecated?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServicesResponse {
  services: Service[];
  total: number;
  limit: number;
  skip: number;
}

export interface ServicesQuery {
  table?: 'INTACT_TOOLBOX' | 'OTHER_SERVICES';
  category?: string;
  sector?: string;
  provider?: string;
  search?: string;
  includeDeprecated?: boolean;
  limit?: number;
  skip?: number;
}

export const categoriesApi = {
  list: async (): Promise<Category[]> => {
    const { data } = await api.get('/categories');
    return data;
  },
};

export const sectorsApi = {
  list: async (): Promise<Sector[]> => {
    const { data } = await api.get('/sectors');
    return data;
  },
};

export interface CreateServiceData {
  shortName: string;
  title: string;
  categoryId: string;
  sectorId?: string;
  provider: string;
  description?: string;
  type?: 'Software' | 'Hardware' | 'Software/Hardware';
  uiType?: 'web' | 'terminal' | 'both';
  trl?: { current?: number; expected?: number };
  license?: string;
  standards?: string[];
  inputs?: { name: string; description?: string; format?: string }[];
  outputs?: { name: string; description?: string; format?: string }[];
  interactsWith?: string[];
  potentialUseCases?: string[];
  repositoryTable?: 'INTACT_TOOLBOX' | 'OTHER_SERVICES';
  currentVersion?: string;
  versions?: { version: string; dockerImage: string; releaseNotes?: string }[];
}

export interface AddVersionData {
  version: string;
  dockerImage: string;
  releaseNotes?: string;
}

// Projects types
export interface Project {
  _id: string;
  shortName: string;
  title: string;
  sector: 'Telecommunications' | 'Healthcare' | 'Transportation' | 'Nuclear' | 'Cross-Sector';
  leader: string;
  involvedPartners: string[];
  description?: string;
  isComposite: boolean;
  atomicProjectIds: { _id: string; shortName: string; title: string; sector: string }[];
  scenarioCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectData {
  shortName: string;
  title: string;
  sector: Project['sector'];
  leader: string;
  involvedPartners?: string[];
  description?: string;
  isComposite?: boolean;
  atomicProjectIds?: string[];
}

export interface ProjectsQuery {
  sector?: Project['sector'];
  leader?: string;
  search?: string;
}

export const projectsApi = {
  list: async (query: ProjectsQuery = {}): Promise<Project[]> => {
    const params = new URLSearchParams();
    if (query.sector) params.append('sector', query.sector);
    if (query.leader) params.append('leader', query.leader);
    if (query.search) params.append('search', query.search);
    const { data } = await api.get(`/projects?${params.toString()}`);
    return data;
  },
  get: async (id: string): Promise<Project> => {
    const { data } = await api.get(`/projects/${id}`);
    return data;
  },
  create: async (projectData: CreateProjectData): Promise<Project> => {
    const { data } = await api.post('/projects', projectData);
    return data;
  },
  update: async (id: string, projectData: Partial<CreateProjectData>): Promise<Project> => {
    const { data } = await api.put(`/projects/${id}`, projectData);
    return data;
  },
  delete: async (id: string): Promise<{ message: string }> => {
    const { data } = await api.delete(`/projects/${id}`);
    return data;
  },
};

export const servicesApi = {
  list: async (query: ServicesQuery = {}): Promise<ServicesResponse> => {
    const params = new URLSearchParams();
    if (query.table) params.append('table', query.table);
    if (query.category) params.append('category', query.category);
    if (query.sector) params.append('sector', query.sector);
    if (query.provider) params.append('provider', query.provider);
    if (query.search) params.append('search', query.search);
    if (query.includeDeprecated) params.append('includeDeprecated', 'true');
    if (query.limit) params.append('limit', String(query.limit));
    if (query.skip) params.append('skip', String(query.skip));

    const { data } = await api.get(`/services?${params.toString()}`);
    return data;
  },
  get: async (id: string): Promise<Service> => {
    const { data } = await api.get(`/services/${id}`);
    return data;
  },
  create: async (serviceData: CreateServiceData): Promise<Service> => {
    const { data } = await api.post('/services', serviceData);
    return data;
  },
  update: async (id: string, serviceData: Partial<CreateServiceData>): Promise<Service> => {
    const { data } = await api.put(`/services/${id}`, serviceData);
    return data;
  },
  delete: async (id: string): Promise<{ message: string }> => {
    const { data } = await api.delete(`/services/${id}`);
    return data;
  },
  addVersion: async (id: string, versionData: AddVersionData): Promise<Service> => {
    const { data } = await api.post(`/services/${id}/versions`, versionData);
    return data;
  },
};

// Scenario types
export interface Topology {
  yaml: string;
  nodes: object[];
  edges: object[];
}

export type DeployStatus = 'pending' | 'running' | 'failed';

export interface DeployedService {
  serviceId: { _id: string; shortName: string; title: string };
  /** Topology node id this deployment was created from. */
  nodeId?: string;
  /** Kubernetes resource name shared by the Deployment and Service. */
  name?: string;
  /** UI presentation of the underlying service. */
  uiType?: 'web' | 'terminal' | 'both';
  /** Coarse per-service deploy status derived from the cluster. */
  status?: DeployStatus;
  /** Reachable NodePort URL for the deployed service. */
  dashboardUrl?: string;
}

/** Per-service result returned by the execute/deploy endpoint. */
export interface DeployedServiceResult {
  nodeId: string;
  serviceId: string;
  name: string;
  uiType: 'web' | 'terminal' | 'both';
  status: DeployStatus;
  dashboardUrl?: string;
  nodePort?: number;
}

export interface ExecuteResult {
  executionId: string;
  namespace: string;
  status: string;
  services: DeployedServiceResult[];
}

export interface Conclusion {
  text: string;
  author: string;
  createdAt: string;
}

export interface Execution {
  _id: string;
  executedAt: string;
  executedBy: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** Kubernetes namespace the topology was deployed into. */
  namespace?: string;
  deployedServices: DeployedService[];
  conclusion?: Conclusion;
  /** @deprecated Legacy MAESTRO field, no longer written or read. */
  maestroSessionId?: string;
}

// Server-Sent Events emitted by the execution events endpoint.
export interface ExecutionServiceStatus {
  name: string;
  status: DeployStatus;
}

export interface ExecutionProgressEvent {
  progress: number;
  services: ExecutionServiceStatus[];
  /** Present only in the single-snapshot response for a terminal execution. */
  status?: string;
}

export interface ExecutionLogEvent {
  service: string;
  pod: string;
  line: string;
}

export interface ExecutionEndEvent {
  status: 'completed' | 'failed';
  services?: ExecutionServiceStatus[];
}

export interface ExecutionErrorEvent {
  message: string;
}

export interface ExecutionEventHandlers {
  onProgress?: (event: ExecutionProgressEvent) => void;
  onLog?: (event: ExecutionLogEvent) => void;
  onEnd?: (event: ExecutionEndEvent) => void;
  onError?: (event: ExecutionErrorEvent) => void;
}

export interface ParsedSseEvent {
  event: string;
  data: string;
}

/**
 * Parse a single raw SSE record (its fields separated by newlines) into an
 * `{ event, data }` pair. Returns null when the record carries no `data:`
 * field (e.g. a keep-alive comment). Pure and side-effect free.
 */
export function parseSseEvent(raw: string): ParsedSseEvent | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      // Per the SSE spec a single leading space after the colon is stripped.
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    // Comments (":" prefix) and other fields (id/retry) are ignored.
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

function dispatchSseEvent(parsed: ParsedSseEvent, handlers: ExecutionEventHandlers): void {
  let payload: unknown;
  try {
    payload = JSON.parse(parsed.data);
  } catch {
    return;
  }
  switch (parsed.event) {
    case 'progress':
      handlers.onProgress?.(payload as ExecutionProgressEvent);
      break;
    case 'log':
      handlers.onLog?.(payload as ExecutionLogEvent);
      break;
    case 'end':
      handlers.onEnd?.(payload as ExecutionEndEvent);
      break;
    case 'error':
      handlers.onError?.(payload as ExecutionErrorEvent);
      break;
  }
}

/**
 * Subscribe to a scenario execution's Server-Sent Events stream.
 *
 * The native `EventSource` cannot attach the `Authorization` header the
 * endpoint requires, so the stream is consumed with `fetch` + a manual
 * `ReadableStream` reader. The auth token is read from the same store the
 * axios request interceptor uses, keeping a single source of truth.
 *
 * Returns an unsubscribe function that aborts the request and stops reading.
 */
export function subscribeToExecutionEvents(
  scenarioId: string,
  executionId: string,
  handlers: ExecutionEventHandlers
): () => void {
  const controller = new AbortController();
  const token = useAuthStore.getState().token;

  void (async () => {
    try {
      const response = await fetch(
        `/api/scenarios/${scenarioId}/executions/${executionId}/events`,
        {
          headers: {
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
        }
      );

      if (!response.ok || !response.body) {
        handlers.onError?.({ message: `Failed to open event stream (${response.status})` });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE records are separated by a blank line.
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const parsed = parseSseEvent(raw);
          if (parsed) dispatchSseEvent(parsed, handlers);
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch (err) {
      // A deliberate unsubscribe surfaces as an AbortError — not a failure.
      if (controller.signal.aborted) return;
      handlers.onError?.({ message: err instanceof Error ? err.message : String(err) });
    }
  })();

  return () => controller.abort();
}

export interface Scenario {
  _id: string;
  projectId: { _id: string; shortName: string; title: string; sector: string } | string;
  title: string;
  description?: string;
  topology: Topology;
  infrastructureId?: {
    _id: string;
    name: string;
    type: string;
    status: string;
    endpoint?: string;
  } | null;
  executions: Execution[];
  latestExecution?: {
    status: Execution['status'];
    executedAt: string;
    executedBy: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScenarioData {
  title: string;
  description?: string;
  topology?: Partial<Topology>;
  infrastructureId?: string;
}

export const scenariosApi = {
  list: async (projectId: string): Promise<Scenario[]> => {
    const { data } = await api.get(`/projects/${projectId}/scenarios`);
    return data;
  },
  get: async (id: string): Promise<Scenario> => {
    const { data } = await api.get(`/scenarios/${id}`);
    return data;
  },
  create: async (projectId: string, scenarioData: CreateScenarioData): Promise<Scenario> => {
    const { data } = await api.post(`/projects/${projectId}/scenarios`, scenarioData);
    return data;
  },
  update: async (id: string, scenarioData: Partial<CreateScenarioData>): Promise<Scenario> => {
    const { data } = await api.put(`/scenarios/${id}`, scenarioData);
    return data;
  },
  delete: async (id: string): Promise<{ message: string }> => {
    const { data } = await api.delete(`/scenarios/${id}`);
    return data;
  },
  execute: async (id: string): Promise<ExecuteResult> => {
    const { data } = await api.post(`/scenarios/${id}/execute`);
    return data;
  },
  teardown: async (
    scenarioId: string,
    executionId: string
  ): Promise<{ executionId: string; namespace?: string; status: string; message: string }> => {
    const { data } = await api.delete(`/scenarios/${scenarioId}/executions/${executionId}`);
    return data;
  },
  addConclusion: async (
    scenarioId: string,
    executionId: string,
    conclusion: { text: string; author: string }
  ): Promise<Execution> => {
    const { data } = await api.post(
      `/scenarios/${scenarioId}/executions/${executionId}/conclusion`,
      conclusion
    );
    return data;
  },
  updateExecutionStatus: async (
    scenarioId: string,
    executionId: string,
    status: 'pending' | 'running' | 'completed' | 'failed'
  ): Promise<Execution> => {
    const { data } = await api.put(`/scenarios/${scenarioId}/executions/${executionId}/status`, {
      status,
    });
    return data;
  },
};

// Infrastructure types
export interface Infrastructure {
  _id: string;
  name: string;
  type: 'kubernetes' | 'docker' | 'virtual';
  endpoint: string;
  capacity: {
    cpu?: number;
    memory?: number;
    storage?: number;
  };
  status: 'active' | 'inactive' | 'error';
  lastHealthCheck?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInfrastructureData {
  name: string;
  type: Infrastructure['type'];
  endpoint: string;
  credentials: string;
  capacity?: Infrastructure['capacity'];
}

export const infrastructuresApi = {
  list: async (): Promise<Infrastructure[]> => {
    const { data } = await api.get('/infrastructures');
    return data;
  },
  get: async (id: string): Promise<Infrastructure> => {
    const { data } = await api.get(`/infrastructures/${id}`);
    return data;
  },
  create: async (infraData: CreateInfrastructureData): Promise<Infrastructure> => {
    const { data } = await api.post('/infrastructures', infraData);
    return data;
  },
  update: async (
    id: string,
    infraData: Partial<CreateInfrastructureData>
  ): Promise<Infrastructure> => {
    const { data } = await api.put(`/infrastructures/${id}`, infraData);
    return data;
  },
  delete: async (id: string): Promise<{ message: string }> => {
    const { data } = await api.delete(`/infrastructures/${id}`);
    return data;
  },
  testConnection: async (
    id: string
  ): Promise<{ success: boolean; status: string; lastHealthCheck: string; message: string }> => {
    const { data } = await api.post(`/infrastructures/${id}/test`);
    return data;
  },
};

// User types
export interface User {
  _id: string;
  username: string;
  role: 'admin';
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserData {
  username: string;
  password: string;
  role?: 'admin';
}

export const usersApi = {
  list: async (): Promise<User[]> => {
    const { data } = await api.get('/users');
    return data;
  },
  create: async (userData: CreateUserData): Promise<User> => {
    const { data } = await api.post('/users', userData);
    return data;
  },
  delete: async (id: string): Promise<{ message: string }> => {
    const { data } = await api.delete(`/users/${id}`);
    return data;
  },
  resetPassword: async (id: string, password: string): Promise<{ message: string }> => {
    const { data } = await api.patch(`/users/${id}/password`, { password });
    return data;
  },
};
