import { useState, useCallback } from 'react';
import type { Service } from '@/lib/api';

export interface InputOutputItem {
  name: string;
  description?: string;
}

export interface VersionItem {
  version: string;
  dockerImage: string;
  releaseNotes?: string;
}

export interface UseServiceFormOptions {
  service?: Service;
}

export interface UseServiceFormReturn {
  // Standards
  standards: string[];
  standardSearch: string;
  customStandardInput: string;
  setStandardSearch: (value: string) => void;
  setCustomStandardInput: (value: string) => void;
  setStandards: React.Dispatch<React.SetStateAction<string[]>>;
  addStandard: (value: string) => void;
  removeStandard: (index: number) => void;
  clearStandards: () => void;

  // License
  licenseSearch: string;
  customLicenseInput: string;
  isLicensePopoverOpen: boolean;
  setLicenseSearch: (value: string) => void;
  setCustomLicenseInput: (value: string) => void;
  setIsLicensePopoverOpen: (value: boolean) => void;
  addLicense: (value: string) => void;
  clearLicense: () => void;

  // Provider
  isProviderPopoverOpen: boolean;
  setIsProviderPopoverOpen: (value: boolean) => void;

  // Interacts With
  interactsWith: string[];
  interactsInput: string;
  setInteractsInput: (value: string) => void;
  setInteractsWith: React.Dispatch<React.SetStateAction<string[]>>;
  addInteractsWith: (value: string) => void;
  removeInteractsWith: (index: number) => void;
  clearInteractsWith: () => void;

  // Use Cases
  useCases: string[];
  useCaseInput: string;
  setUseCaseInput: React.Dispatch<React.SetStateAction<string>>;
  setUseCases: React.Dispatch<React.SetStateAction<string[]>>;
  addUseCase: (value: string) => void;
  removeUseCase: (index: number) => void;

  // Inputs
  inputs: InputOutputItem[];
  setInputs: React.Dispatch<React.SetStateAction<InputOutputItem[]>>;
  addInput: (item: InputOutputItem) => void;
  removeInput: (index: number) => void;

  // Outputs
  outputs: InputOutputItem[];
  setOutputs: React.Dispatch<React.SetStateAction<InputOutputItem[]>>;
  addOutput: (item: InputOutputItem) => void;
  removeOutput: (index: number) => void;

  // Versions
  versions: VersionItem[];
  setVersions: React.Dispatch<React.SetStateAction<VersionItem[]>>;
  addVersion: (item: VersionItem) => void;
  removeVersion: (index: number) => void;

  // Utility
  addTag: (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    inputSetter: React.Dispatch<React.SetStateAction<string>>
  ) => void;
  removeTag: (index: number, setter: React.Dispatch<React.SetStateAction<string[]>>) => void;
  addInputOutput: (type: 'input' | 'output', name: string, description: string) => void;
  removeInputOutput: (type: 'input' | 'output', index: number) => void;
  getLatestVersion: () => string | undefined;
}

export function useServiceForm({ service }: UseServiceFormOptions = {}): UseServiceFormReturn {
  // Standards
  const [standards, _setStandards] = useState<string[]>(service?.standards || []);
  const [standardSearch, setStandardSearch] = useState('');
  const [customStandardInput, setCustomStandardInput] = useState('');
  const setStandards = useCallback((value: string[] | ((prev: string[]) => string[])) => {
    _setStandards(value);
  }, []);

  // License
  const [licenseSearch, setLicenseSearch] = useState('');
  const [customLicenseInput, setCustomLicenseInput] = useState('');
  const [isLicensePopoverOpen, setIsLicensePopoverOpen] = useState(false);

  // Provider
  const [isProviderPopoverOpen, setIsProviderPopoverOpen] = useState(false);

  // Interacts With
  const [interactsWith, _setInteractsWith] = useState<string[]>(service?.interactsWith || []);
  const [interactsInput, setInteractsInput] = useState('');
  const setInteractsWith = useCallback((value: string[] | ((prev: string[]) => string[])) => {
    _setInteractsWith(value);
  }, []);

  // Use Cases
  const [useCases, _setUseCases] = useState<string[]>(service?.potentialUseCases || []);
  const [useCaseInput, setUseCaseInput] = useState('');
  const setUseCases = useCallback((value: string[] | ((prev: string[]) => string[])) => {
    _setUseCases(value);
  }, []);

  // Inputs
  const [inputs, setInputs] = useState<InputOutputItem[]>(service?.inputs || []);

  // Outputs
  const [outputs, setOutputs] = useState<InputOutputItem[]>(service?.outputs || []);

  // Versions
  const [versions, _setVersions] = useState<VersionItem[]>(
    service?.versions?.map((v) => ({
      version: v.version,
      dockerImage: v.dockerImage,
      releaseNotes: v.releaseNotes,
    })) || []
  );
  const setVersions = useCallback(
    (value: VersionItem[] | ((prev: VersionItem[]) => VersionItem[])) => {
      _setVersions(value);
    },
    []
  );

  // --- Standards ---
  const addStandard = useCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed) {
      setStandards((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    }
  }, []);

  const removeStandard = useCallback((index: number) => {
    setStandards((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearStandards = useCallback(() => {
    setStandards([]);
  }, []);

  // --- License ---
  const addLicense = useCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed) {
      // The actual setValue is handled in the component
      // This is just for validation
    }
  }, []);

  const clearLicense = useCallback(() => {
    // The actual setValue is handled in the component
  }, []);

  // --- Interacts With ---
  const addInteractsWith = useCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed) {
      setInteractsWith((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    }
  }, []);

  const removeInteractsWith = useCallback((index: number) => {
    setInteractsWith((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearInteractsWith = useCallback(() => {
    setInteractsWith([]);
  }, []);

  // --- Use Cases ---
  const addUseCase = useCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed) {
      setUseCases((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    }
  }, []);

  const removeUseCase = useCallback((index: number) => {
    setUseCases((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // --- Inputs ---
  const addInput = useCallback((item: InputOutputItem) => {
    const name = item.name.trim();
    if (name) {
      setInputs((prev) => [...prev, { name, description: item.description?.trim() || undefined }]);
    }
  }, []);

  const removeInput = useCallback((index: number) => {
    setInputs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // --- Outputs ---
  const addOutput = useCallback((item: InputOutputItem) => {
    const name = item.name.trim();
    if (name) {
      setOutputs((prev) => [...prev, { name, description: item.description?.trim() || undefined }]);
    }
  }, []);

  const removeOutput = useCallback((index: number) => {
    setOutputs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // --- Versions ---
  const addVersion = useCallback((item: VersionItem) => {
    setVersions((prev) => [item, ...prev]);
  }, []);

  const removeVersion = useCallback((index: number) => {
    setVersions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // --- Utility ---
  const addTag = useCallback(
    (
      value: string,
      setter: React.Dispatch<React.SetStateAction<string[]>>,
      inputSetter: React.Dispatch<React.SetStateAction<string>>
    ) => {
      const trimmed = value.trim();
      if (trimmed) {
        setter((prev) => [...prev, trimmed]);
        inputSetter('');
      }
    },
    []
  );

  const removeTag = useCallback(
    (index: number, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
      setter((prev) => prev.filter((_, i) => i !== index));
    },
    []
  );

  const addInputOutput = useCallback(
    (type: 'input' | 'output', name: string, description: string) => {
      if (name.trim()) {
        const item = { name: name.trim(), description: description.trim() || undefined };
        if (type === 'input') {
          setInputs((prev) => [...prev, item]);
        } else {
          setOutputs((prev) => [...prev, item]);
        }
      }
    },
    []
  );

  const removeInputOutput = useCallback((type: 'input' | 'output', index: number) => {
    if (type === 'input') {
      setInputs((prev) => prev.filter((_, i) => i !== index));
    } else {
      setOutputs((prev) => prev.filter((_, i) => i !== index));
    }
  }, []);

  const getLatestVersion = useCallback(() => {
    return versions.length > 0 ? versions[0].version : undefined;
  }, [versions]);

  return {
    // Standards
    standards,
    standardSearch,
    customStandardInput,
    setStandardSearch,
    setCustomStandardInput,
    setStandards,
    addStandard,
    removeStandard,
    clearStandards,

    // License
    licenseSearch,
    customLicenseInput,
    isLicensePopoverOpen,
    setLicenseSearch,
    setCustomLicenseInput,
    setIsLicensePopoverOpen,
    addLicense,
    clearLicense,

    // Provider
    isProviderPopoverOpen,
    setIsProviderPopoverOpen,

    // Interacts With
    interactsWith,
    interactsInput,
    setInteractsInput,
    setInteractsWith,
    addInteractsWith,
    removeInteractsWith,
    clearInteractsWith,

    // Use Cases
    useCases,
    useCaseInput,
    setUseCaseInput,
    setUseCases,
    addUseCase,
    removeUseCase,

    // Inputs
    inputs,
    setInputs,
    addInput,
    removeInput,

    // Outputs
    outputs,
    setOutputs,
    addOutput,
    removeOutput,

    // Versions
    versions,
    setVersions,
    addVersion,
    removeVersion,

    // Utility
    addTag,
    removeTag,
    addInputOutput,
    removeInputOutput,
    getLatestVersion,
  };
}
