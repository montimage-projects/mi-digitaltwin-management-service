import { renderHook, act } from '@testing-library/react';
import { useServiceForm } from './useServiceForm';
import type { VersionItem } from './useServiceForm';
import type { Service } from '@/lib/api';

describe('useServiceForm', () => {
  describe('initialization without service', () => {
    it('should initialize all state to defaults', () => {
      const { result } = renderHook(() => useServiceForm());

      expect(result.current.standards).toEqual([]);
      expect(result.current.interactsWith).toEqual([]);
      expect(result.current.useCases).toEqual([]);
      expect(result.current.inputs).toEqual([]);
      expect(result.current.outputs).toEqual([]);
      expect(result.current.versions).toEqual([]);
      expect(result.current.standardSearch).toBe('');
      expect(result.current.licenseSearch).toBe('');
      expect(result.current.customStandardInput).toBe('');
      expect(result.current.customLicenseInput).toBe('');
      expect(result.current.interactsInput).toBe('');
      expect(result.current.useCaseInput).toBe('');
      expect(result.current.isLicensePopoverOpen).toBe(false);
      expect(result.current.isProviderPopoverOpen).toBe(false);
      expect(result.current.getLatestVersion()).toBeUndefined();
    });
  });

  describe('initialization with service', () => {
    it('should initialize state from service prop', () => {
      const mockService = {
        _id: 'test-id',
        shortName: 'TEST',
        title: 'Test Service',
        standards: ['GDPR', 'ISO 27001'],
        interactsWith: ['ServiceA', 'ServiceB'],
        potentialUseCases: ['Use case 1'],
        inputs: [{ name: 'input1', description: 'desc1' }],
        outputs: [{ name: 'output1' }],
        versions: [{ version: '1.0.0', dockerImage: 'image:1.0.0', releaseNotes: 'Initial' }],
      } as unknown as Service;

      const { result } = renderHook(() => useServiceForm({ service: mockService }));

      expect(result.current.standards).toEqual(['GDPR', 'ISO 27001']);
      expect(result.current.interactsWith).toEqual(['ServiceA', 'ServiceB']);
      expect(result.current.useCases).toEqual(['Use case 1']);
      expect(result.current.inputs).toEqual([{ name: 'input1', description: 'desc1' }]);
      expect(result.current.outputs).toEqual([{ name: 'output1' }]);
      expect(result.current.versions).toEqual([
        { version: '1.0.0', dockerImage: 'image:1.0.0', releaseNotes: 'Initial' },
      ]);
      expect(result.current.getLatestVersion()).toBe('1.0.0');
    });
  });

  describe('standards management', () => {
    it('should add a standard', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.addStandard('GDPR');
      });
      expect(result.current.standards).toEqual(['GDPR']);
    });

    it('should not add duplicate standards', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.addStandard('GDPR');
      });
      act(() => {
        result.current.addStandard('GDPR');
      });
      expect(result.current.standards).toEqual(['GDPR']);
    });

    it('should remove a standard by index', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.setStandards(['A', 'B', 'C']);
      });
      act(() => {
        result.current.removeStandard(1);
      });
      expect(result.current.standards).toEqual(['A', 'C']);
    });

    it('should clear all standards', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.setStandards(['A', 'B']);
      });
      act(() => {
        result.current.clearStandards();
      });
      expect(result.current.standards).toEqual([]);
    });

    it('should update standards via setter', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.setStandards(['X', 'Y']);
      });
      expect(result.current.standards).toEqual(['X', 'Y']);
    });
  });

  describe('interactsWith management', () => {
    it('should add interactsWith', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.addInteractsWith('ServiceA');
      });
      expect(result.current.interactsWith).toEqual(['ServiceA']);
    });

    it('should not add duplicate interactsWith', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.addInteractsWith('ServiceA');
      });
      act(() => {
        result.current.addInteractsWith('ServiceA');
      });
      expect(result.current.interactsWith).toEqual(['ServiceA']);
    });

    it('should remove interactsWith by index', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.setInteractsWith(['A', 'B', 'C']);
      });
      act(() => {
        result.current.removeInteractsWith(1);
      });
      expect(result.current.interactsWith).toEqual(['A', 'C']);
    });

    it('should clear all interactsWith', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.setInteractsWith(['A', 'B']);
      });
      act(() => {
        result.current.clearInteractsWith();
      });
      expect(result.current.interactsWith).toEqual([]);
    });
  });

  describe('useCases management', () => {
    it('should add a use case', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.addUseCase('Test case');
      });
      expect(result.current.useCases).toEqual(['Test case']);
    });

    it('should not add duplicate use cases', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.addUseCase('Test case');
      });
      act(() => {
        result.current.addUseCase('Test case');
      });
      expect(result.current.useCases).toEqual(['Test case']);
    });

    it('should remove a use case by index', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.setUseCases(['A', 'B', 'C']);
      });
      act(() => {
        result.current.removeUseCase(1);
      });
      expect(result.current.useCases).toEqual(['A', 'C']);
    });
  });

  describe('inputs management', () => {
    it('should add an input', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.addInput({ name: 'test-input', description: 'desc' });
      });
      expect(result.current.inputs).toEqual([{ name: 'test-input', description: 'desc' }]);
    });

    it('should not add input without name', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.addInput({ name: '', description: 'desc' });
      });
      expect(result.current.inputs).toEqual([]);
    });

    it('should remove an input by index', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.setInputs([{ name: 'a' }, { name: 'b' }]);
      });
      act(() => {
        result.current.removeInput(0);
      });
      expect(result.current.inputs).toEqual([{ name: 'b' }]);
    });
  });

  describe('outputs management', () => {
    it('should add an output', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.addOutput({ name: 'test-output' });
      });
      expect(result.current.outputs).toEqual([{ name: 'test-output' }]);
    });

    it('should not add output without name', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.addOutput({ name: '', description: 'desc' });
      });
      expect(result.current.outputs).toEqual([]);
    });

    it('should remove an output by index', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.setOutputs([{ name: 'a' }, { name: 'b' }]);
      });
      act(() => {
        result.current.removeOutput(0);
      });
      expect(result.current.outputs).toEqual([{ name: 'b' }]);
    });
  });

  describe('versions management', () => {
    it('should add a version', () => {
      const { result } = renderHook(() => useServiceForm());
      const newVersion: VersionItem = { version: '1.0.0', dockerImage: 'img:1.0.0' };
      act(() => {
        result.current.addVersion(newVersion);
      });
      expect(result.current.versions).toEqual([newVersion]);
    });

    it('should add version at the beginning (newest first)', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.addVersion({ version: '1.0.0', dockerImage: 'img:1.0.0' });
      });
      act(() => {
        result.current.addVersion({ version: '2.0.0', dockerImage: 'img:2.0.0' });
      });
      expect(result.current.versions[0].version).toBe('2.0.0');
    });

    it('should remove a version by index', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.setVersions([
          { version: '1.0.0', dockerImage: 'a' },
          { version: '2.0.0', dockerImage: 'b' },
        ]);
      });
      act(() => {
        result.current.removeVersion(0);
      });
      expect(result.current.versions).toEqual([{ version: '2.0.0', dockerImage: 'b' }]);
    });

    it('should get latest version', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.setVersions([
          { version: '2.0.0', dockerImage: 'b' },
          { version: '1.0.0', dockerImage: 'a' },
        ]);
      });
      expect(result.current.getLatestVersion()).toBe('2.0.0');
    });
  });

  describe('utility functions', () => {
    it('should add a tag with setter and inputSetter', () => {
      const { result } = renderHook(() => useServiceForm());
      const setter = result.current.setUseCases;
      const inputSetter = result.current.setUseCaseInput;

      act(() => {
        result.current.addTag('test', setter, inputSetter);
      });
      expect(result.current.useCases).toEqual(['test']);
      expect(result.current.useCaseInput).toBe('');
    });

    it('should not add empty tag', () => {
      const { result } = renderHook(() => useServiceForm());
      const setter = result.current.setUseCases;
      const inputSetter = result.current.setUseCaseInput;

      act(() => {
        result.current.addTag('', setter, inputSetter);
      });
      expect(result.current.useCases).toEqual([]);
    });

    it('should remove a tag', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.setUseCases(['a', 'b', 'c']);
      });
      const setter = result.current.setUseCases;
      act(() => {
        result.current.removeTag(1, setter);
      });
      expect(result.current.useCases).toEqual(['a', 'c']);
    });

    it('should add input/output via addInputOutput', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.addInputOutput('input', 'name', 'desc');
      });
      expect(result.current.inputs).toEqual([{ name: 'name', description: 'desc' }]);
    });

    it('should remove input/output via removeInputOutput', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.setInputs([{ name: 'a' }, { name: 'b' }]);
      });
      act(() => {
        result.current.removeInputOutput('input', 0);
      });
      expect(result.current.inputs).toEqual([{ name: 'b' }]);
    });
  });

  describe('popover state management', () => {
    it('should toggle license popover', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.setIsLicensePopoverOpen(true);
      });
      expect(result.current.isLicensePopoverOpen).toBe(true);

      act(() => {
        result.current.setIsLicensePopoverOpen(false);
      });
      expect(result.current.isLicensePopoverOpen).toBe(false);
    });

    it('should toggle provider popover', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.setIsProviderPopoverOpen(true);
      });
      expect(result.current.isProviderPopoverOpen).toBe(true);

      act(() => {
        result.current.setIsProviderPopoverOpen(false);
      });
      expect(result.current.isProviderPopoverOpen).toBe(false);
    });
  });

  describe('search state management', () => {
    it('should update standard search', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.setStandardSearch('GDPR');
      });
      expect(result.current.standardSearch).toBe('GDPR');
    });

    it('should update license search', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.setLicenseSearch('MIT');
      });
      expect(result.current.licenseSearch).toBe('MIT');
    });

    it('should update custom standard input', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.setCustomStandardInput('Custom Std');
      });
      expect(result.current.customStandardInput).toBe('Custom Std');
    });

    it('should update custom license input', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.setCustomLicenseInput('Custom Lic');
      });
      expect(result.current.customLicenseInput).toBe('Custom Lic');
    });

    it('should update interacts input', () => {
      const { result } = renderHook(() => useServiceForm());
      act(() => {
        result.current.setInteractsInput('Service');
      });
      expect(result.current.interactsInput).toBe('Service');
    });
  });
});
