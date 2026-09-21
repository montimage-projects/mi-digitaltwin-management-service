/**
 * Server-wide constants
 */

/** Repository table identifiers. */
export const REPOSITORY_TABLES = {
  INTACT_TOOLBOX: 'INTACT_TOOLBOX',
  OTHER_SERVICES: 'OTHER_SERVICES',
} as const;

/** Default limit for list queries. */
export const DEFAULT_LIST_LIMIT = 20;

/** Maximum limit for list queries. */
export const MAX_LIST_LIMIT = 1000;
