/**
 * Application-wide constants
 */

/** Maximum number of items returned by list endpoints (pagination cap). */
export const MAX_LIST_LIMIT = 1000;

/** Repository table identifiers used across services. */
export const REPOSITORY_TABLES = {
  INTACT_TOOLBOX: 'INTACT_TOOLBOX',
  OTHER_SERVICES: 'OTHER_SERVICES',
} as const;

/** Default limit for list queries when no explicit limit is provided. */
export const DEFAULT_LIST_LIMIT = 20;
