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
  logoAlt: string;
  faviconSrc: string;
  /**
   * Whether the logo needs a light backdrop chip to stay legible on the app's
   * dark chrome (e.g. a dark/transparent wordmark). Profiles whose logo already
   * reads well on dark leave this false.
   */
  logoBackdrop: boolean;
}

export const BRANDING_PROFILES: Record<BrandingProfileName, BrandingProfile> = {
  default: {
    appName: 'DigitalTwin Management Platform',
    appNameShort: 'Digital Twin Platform',
    logoSrc: '/montimage_logo.png',
    logoAlt: 'Montimage logo',
    faviconSrc: '/montimage_favicon.png',
    logoBackdrop: false,
  },
  intact: {
    appName: 'DigitalTwin Management Platform',
    appNameShort: 'Digital Twin Platform',
    logoSrc: '/intact_logo.png',
    logoAlt: 'INTACT logo',
    faviconSrc: '/intact_favicon.png',
    logoBackdrop: true,
  },
  secassured: {
    appName: 'secSIM',
    appNameShort: 'secSIM',
    logoSrc: '/secassured_logo.png',
    logoAlt: 'SecAssured logo',
    faviconSrc: '/secassured_favicon.png',
    logoBackdrop: false,
  },
};

export const DEFAULT_BRANDING_PROFILE: BrandingProfileName = 'default';

/**
 * Resolve a profile by name, silently falling back to the default profile on an
 * unrecognized name (matches the client's permissive `|| fallback` convention).
 */
export function resolveBrandingProfile(name: string | undefined): BrandingProfile {
  const key = (
    name && Object.prototype.hasOwnProperty.call(BRANDING_PROFILES, name)
      ? name
      : DEFAULT_BRANDING_PROFILE
  ) as BrandingProfileName;
  return BRANDING_PROFILES[key];
}
