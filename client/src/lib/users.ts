/**
 * User-related types and API functions.
 * Extracted from api.ts to reduce its size.
 */

import api from './api-core';

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
