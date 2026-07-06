/**
 * Named branding profiles.
 * Pure data + resolver, with no `import.meta.env` reference, so this module is
 * safe to import both from browser code (branding.ts) and from Node build code
 * (vite.config.ts) that cannot see Vite's client env.
 */

export type BrandingProfileName = 'default' | 'intact' | 'secassured';

export interface BrandingProfile {
  appName: string;
  appNameShort: string;
  logoSrc: string;
  faviconSrc: string;
}

export const BRANDING_PROFILES: Record<BrandingProfileName, BrandingProfile> = {
  default: {
    appName: 'DigitalTwin Management Platform',
    appNameShort: 'Digital Twin Platform',
    logoSrc: '/montimage_logo.png',
    faviconSrc: '/montimage_favicon.png',
  },
  intact: {
    appName: 'DigitalTwin Management Platform',
    appNameShort: 'Digital Twin Platform',
    logoSrc: '/intact_logo.png',
    faviconSrc: '/intact_logo.png',
  },
  secassured: {
    appName: 'secSIM',
    appNameShort: 'secSIM',
    logoSrc: '/secassured_logo.png',
    faviconSrc: '/secassured_logo.png',
  },
};

export const DEFAULT_BRANDING_PROFILE: BrandingProfileName = 'default';

/**
 * Resolve a profile by name, silently falling back to the default profile on an
 * unrecognized name (matches the client's permissive `|| fallback` convention).
 */
export function resolveBrandingProfile(name: string | undefined): BrandingProfile {
  const key = (
    name && name in BRANDING_PROFILES ? name : DEFAULT_BRANDING_PROFILE
  ) as BrandingProfileName;
  return BRANDING_PROFILES[key];
}
