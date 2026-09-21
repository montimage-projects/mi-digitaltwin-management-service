import type { CreateServiceData } from '@/lib/api';
import type { VersionItem } from '@/hooks/useServiceForm';

export interface ServicePayloadParts {
  shortName: string;
  title: string;
  categoryId: string;
  sectorId?: string;
  provider: string;
  description?: string;
  type: 'Software' | 'Hardware' | 'Software/Hardware';
  uiType: 'web' | 'terminal' | 'both';
  trlCurrent: number | undefined;
  trlExpected: number | undefined;
  license?: string;
  repositoryTable: 'INTACT_TOOLBOX' | 'OTHER_SERVICES';
  currentVersion?: string;
  standards: string[];
  inputs: Array<{ name: string; description?: string }>;
  outputs: Array<{ name: string; description?: string }>;
  interactsWith: string[];
  potentialUseCases: string[];
  versions: VersionItem[];
}

export function useServicePayload() {
  let submitCallback: ((data: CreateServiceData) => Promise<void>) | null = null;

  const setOnSubmit = (callback: (data: CreateServiceData) => Promise<void>) => {
    submitCallback = callback;
  };

  const assemblePayload = (parts: ServicePayloadParts) => {
    const latestVersion = parts.versions.length > 0 ? parts.versions[0].version : undefined;
    const serviceData: CreateServiceData = {
      shortName: parts.shortName,
      title: parts.title,
      categoryId: parts.categoryId,
      sectorId: parts.sectorId || undefined,
      provider: parts.provider,
      description: parts.description,
      type: parts.type,
      uiType: parts.uiType,
      trl: {
        current: parts.trlCurrent,
        expected: parts.trlExpected,
      },
      license: parts.license,
      repositoryTable: parts.repositoryTable,
      currentVersion: latestVersion || parts.currentVersion,
      standards: parts.standards,
      inputs: parts.inputs,
      outputs: parts.outputs,
      interactsWith: parts.interactsWith,
      potentialUseCases: parts.potentialUseCases,
      versions: parts.versions,
    };
    if (submitCallback) {
      submitCallback(serviceData);
    }
  };

  return { setOnSubmit, assemblePayload };
}
