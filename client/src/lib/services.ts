/**
 * Service-related types and API functions.
 * Extracted from api.ts to reduce its size.
 */

import api from './api-core';
import { REPOSITORY_TABLES } from './constants';

export type RepositoryTable = (typeof REPOSITORY_TABLES)[keyof typeof REPOSITORY_TABLES];

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
  trl: { current?: number; expected?: number };
  license?: string;
  standards: string[];
  inputs: { name: string; description?: string }[];
  outputs: { name: string; description?: string }[];
  interactsWith: string[];
  potentialUseCases: string[];
  repositoryTable: RepositoryTable;
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
  table?: RepositoryTable;
  category?: string;
  sector?: string;
  provider?: string;
  search?: string;
  includeDeprecated?: boolean;
  limit?: number;
  skip?: number;
}

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
  repositoryTable?: RepositoryTable;
  currentVersion?: string;
  versions?: { version: string; dockerImage: string; releaseNotes?: string }[];
}

export interface AddVersionData {
  version: string;
  dockerImage: string;
  releaseNotes?: string;
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
