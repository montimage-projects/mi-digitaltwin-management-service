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
  provider: string;
  description?: string;
  currentVersion?: string;
  versions: ServiceVersion[];
  type: 'Software' | 'Hardware' | 'Software/Hardware';
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
  provider?: string;
  search?: string;
  limit?: number;
  skip?: number;
}

export const categoriesApi = {
  list: async (): Promise<Category[]> => {
    const { data } = await api.get('/categories');
    return data;
  },
};

export interface CreateServiceData {
  shortName: string;
  title: string;
  categoryId: string;
  provider: string;
  description?: string;
  type?: 'Software' | 'Hardware' | 'Software/Hardware';
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
    if (query.provider) params.append('provider', query.provider);
    if (query.search) params.append('search', query.search);
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

export interface DeployedService {
  serviceId: { _id: string; shortName: string; title: string };
  dashboardUrl?: string;
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
  deployedServices: DeployedService[];
  conclusion?: Conclusion;
  maestroSessionId?: string;
}

export interface Scenario {
  _id: string;
  projectId: { _id: string; shortName: string; title: string; sector: string } | string;
  title: string;
  description?: string;
  topology: Topology;
  infrastructureId?: { _id: string; name: string; type: string; status: string; endpoint?: string } | null;
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
  execute: async (id: string): Promise<{ executionId: string; maestroUrl: string; status: string }> => {
    const { data } = await api.post(`/scenarios/${id}/execute`);
    return data;
  },
  addConclusion: async (
    scenarioId: string,
    executionId: string,
    conclusion: { text: string; author: string }
  ): Promise<Execution> => {
    const { data } = await api.post(`/scenarios/${scenarioId}/executions/${executionId}/conclusion`, conclusion);
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
  update: async (id: string, infraData: Partial<CreateInfrastructureData>): Promise<Infrastructure> => {
    const { data } = await api.put(`/infrastructures/${id}`, infraData);
    return data;
  },
  delete: async (id: string): Promise<{ message: string }> => {
    const { data } = await api.delete(`/infrastructures/${id}`);
    return data;
  },
  testConnection: async (id: string): Promise<{ success: boolean; status: string; lastHealthCheck: string; message: string }> => {
    const { data } = await api.post(`/infrastructures/${id}/test`);
    return data;
  },
};
