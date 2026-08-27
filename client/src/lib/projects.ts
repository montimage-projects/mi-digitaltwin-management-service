/**
 * Project-related types and API functions.
 * Extracted from api.ts to reduce its size.
 */

import api from './api-core';

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
