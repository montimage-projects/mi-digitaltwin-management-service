/**
 * Configuration-completeness status for services (issue #245).
 *
 * A service is "complete" when every entry of `REQUIRED_SERVICE_FIELDS`
 * passes; otherwise it "needs configuration" and `missing` lists the
 * human-readable labels of the failing requirements.
 *
 * Required configuration:
 * - `title`, `provider` and `category` — schema-required fields — plus a
 *   non-empty `description`.
 * - A resolvable container image. This mirrors the server rule in
 *   `resolveTopologyNodes` (`server/src/services/kubernetesDeploy.ts`) for a
 *   node without a version override: the version matching `currentVersion`,
 *   otherwise the LAST entry of `versions`, must carry a non-empty
 *   `dockerImage`. A service failing this check cannot be deployed.
 *
 * `deployment` is intentionally NOT required: `mergeDeploymentSpec` on the
 * server defaults it (`kind: 'Deployment'`, `role: 'generic'`), so a service
 * without one still deploys.
 *
 * To change what counts as required, edit `REQUIRED_SERVICE_FIELDS`.
 */
import type { Category, ServiceVersion } from './services';

export type ServiceConfigState = 'complete' | 'incomplete';

export interface ServiceConfigStatus {
  state: ServiceConfigState;
  /** Human-readable labels of the missing requirements (empty when complete). */
  missing: string[];
}

/** Structural subset of `Service` the status depends on. */
export interface ServiceConfigInput {
  title?: string;
  provider?: string;
  categoryId?: Pick<Category, '_id'> | null;
  description?: string;
  currentVersion?: string;
  versions?: Pick<ServiceVersion, 'version' | 'dockerImage'>[] | null;
}

export interface ServiceRequirement {
  /** Label shown to users when the requirement is not met. */
  label: string;
  isMet: (service: ServiceConfigInput) => boolean;
}

const hasText = (value: string | undefined | null): boolean => Boolean(value?.trim());

/**
 * Docker image a topology node without a version override would deploy, or
 * `undefined` when none resolves (see `resolveTopologyNodes` on the server).
 */
export function resolveDeployableImage(service: ServiceConfigInput): string | undefined {
  const versions = service.versions ?? [];
  const entry =
    (service.currentVersion && versions.find((v) => v.version === service.currentVersion)) ||
    versions[versions.length - 1];
  return entry?.dockerImage;
}

/** Requirements a service must meet to be considered fully configured. */
export const REQUIRED_SERVICE_FIELDS: readonly ServiceRequirement[] = [
  { label: 'Title', isMet: (s) => hasText(s.title) },
  { label: 'Provider', isMet: (s) => hasText(s.provider) },
  { label: 'Category', isMet: (s) => Boolean(s.categoryId) },
  { label: 'Description', isMet: (s) => hasText(s.description) },
  { label: 'Container image', isMet: (s) => hasText(resolveDeployableImage(s)) },
];

export function getServiceConfigStatus(service: ServiceConfigInput): ServiceConfigStatus {
  const missing = REQUIRED_SERVICE_FIELDS.filter((req) => !req.isMet(service)).map(
    (req) => req.label
  );
  return { state: missing.length === 0 ? 'complete' : 'incomplete', missing };
}
