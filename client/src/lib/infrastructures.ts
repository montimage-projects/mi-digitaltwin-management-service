/**
 * Infrastructure-related types and API functions.
 * Extracted from api.ts to reduce its size.
 */

import api from './api-core';

export interface Infrastructure {
  _id: string;
  name: string;
  type: 'kubernetes' | 'docker' | 'virtual';
  endpoint: string;
  capacity: { cpu?: number; memory?: number; storage?: number };
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
