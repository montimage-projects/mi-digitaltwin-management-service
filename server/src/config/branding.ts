/**
 * Product branding constants.
 * Single source of truth for the platform's display name and owning
 * organization, so server output (startup banner, OpenAPI docs) stays in
 * sync without hardcoded strings.
 *
 * The app name resolves from the active branding profile (BRANDING_PROFILE),
 * with per-field env-var overrides as an escape hatch. See branding-profiles.ts.
 */

import { env } from './env.js';
import { resolveAppName } from './branding-profiles.js';

export const APP_NAME = env.APP_NAME || resolveAppName(env.BRANDING_PROFILE);

export const ORG_NAME = env.ORG_NAME || 'Montimage';

export const ORG_URL = env.ORG_URL || 'https://montimage.eu';
