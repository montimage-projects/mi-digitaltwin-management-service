/**
 * Central API module — re-exports from feature-specific sub-modules.
 *
 * Each sub-module (services, scenarios, infrastructures, projects, users,
 * sse, constants) owns its own types and API functions. This file keeps the
 * public surface unchanged for existing imports.
 */

export { default as api } from './api-core';

// Auth
export const authApi = {
  login: async (username: string, password: string) => {
    const { data } = await (
      await import('./api-core')
    ).default.post('/auth/login', {
      username,
      password,
    });
    return data;
  },
  me: async () => {
    const { data } = await (await import('./api-core')).default.get('/auth/me');
    return data;
  },
  logout: async () => {
    const { data } = await (await import('./api-core')).default.post('/auth/logout');
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
