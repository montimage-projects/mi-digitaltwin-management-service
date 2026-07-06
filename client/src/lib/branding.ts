/**
 * Product branding constants.
 * Single source of truth for the platform's display name, logo/favicon, and
 * owning organization, so UI surfaces stay in sync without hardcoded strings.
 *
 * Values resolve from the active branding profile (VITE_BRANDING_PROFILE), with
 * per-field env-var overrides as an escape hatch. See branding-profiles.ts.
 */

import { resolveBrandingProfile } from './branding-profiles';

const profile = resolveBrandingProfile(import.meta.env.VITE_BRANDING_PROFILE);

export const APP_NAME = import.meta.env.VITE_APP_NAME || profile.appName;

/** Shorter form of APP_NAME for tight UI spaces (sidebar footer, etc.). */
export const APP_NAME_SHORT = import.meta.env.VITE_APP_NAME_SHORT || profile.appNameShort;

export const LOGO_SRC = import.meta.env.VITE_LOGO_SRC || profile.logoSrc;

/** Accessible alt text describing the rendered logo (profile-specific). */
export const LOGO_ALT = import.meta.env.VITE_LOGO_ALT || profile.logoAlt;

export const FAVICON_SRC = import.meta.env.VITE_FAVICON_SRC || profile.faviconSrc;

/**
 * Whether to render a light backdrop chip behind the logo so a dark/transparent
 * wordmark stays legible on the app's dark chrome (profile-specific).
 */
export const LOGO_BACKDROP =
  (import.meta.env.VITE_LOGO_BACKDROP ?? String(profile.logoBackdrop)) === 'true';

export const ORG_NAME = import.meta.env.VITE_ORG_NAME || 'Montimage';

export const ORG_URL = import.meta.env.VITE_ORG_URL || 'https://montimage.eu';

export const ORG_DESCRIPTION =
  import.meta.env.VITE_ORG_DESCRIPTION ||
  'Montimage is a French cybersecurity company specialising in network monitoring, AI-driven threat detection, and open-source security tooling for critical infrastructure.';
