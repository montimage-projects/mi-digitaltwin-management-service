/**
 * Central API module — re-exports from feature-specific sub-modules.
 *
 * Each sub-module (services, scenarios, infrastructures, projects, users,
 * sse, constants) owns its own types and API functions. This file keeps the
 * public surface unchanged for existing imports.
 */

import api from './api-core';

export { api };

// Auth
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

// Re-export everything from feature modules
export * from './constants';
export * from './sse-types';
export * from './sse';
export * from './services';
export * from './scenarios';
export * from './infrastructures';
export * from './projects';
export * from './users';
