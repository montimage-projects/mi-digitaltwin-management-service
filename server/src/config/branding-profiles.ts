/**
 * Named branding profiles (server side).
 * The server only ever renders branding as text (OpenAPI title, startup
 * banner), never a logo/favicon image reference, so this table is deliberately
 * smaller than the client's — app name only.
 */

export type BrandingProfileName = 'default' | 'intact' | 'secassured';

const APP_NAMES: Record<BrandingProfileName, string> = {
  default: 'DigitalTwin Management Platform',
  intact: 'DigitalTwin Management Platform',
  secassured: 'secSIM',
};

export function resolveAppName(profileName: string | undefined): string {
  const key = (
    profileName && profileName in APP_NAMES ? profileName : 'default'
  ) as BrandingProfileName;
  return APP_NAMES[key];
}
