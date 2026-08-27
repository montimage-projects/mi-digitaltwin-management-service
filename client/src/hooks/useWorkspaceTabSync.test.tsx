import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useWorkspaceTabSync } from './useWorkspaceTabSync';
import { useWorkspaceStore } from '@/store/workspace-store';

// Mock the workspace store
vi.mock('@/store/workspace-store', () => ({
  useWorkspaceStore: vi.fn(),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
};

const mockStore = (
  openTab: ReturnType<typeof vi.fn>,
  updateTab: ReturnType<typeof vi.fn>,
  tabs: Array<{ id: string; scenarioId: string; isDirty?: boolean }>
) => ({
  openTab,
  updateTab,
  tabs,
  activeTabId: null,
  closeTab: vi.fn(),
  setActiveTab: vi.fn(),
  closeAllTabs: vi.fn(),
});

describe('useWorkspaceTabSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens a tab when scenario loads', () => {
    const mockOpenTab = vi.fn();
    const mockUpdateTab = vi.fn();

    vi.mocked(useWorkspaceStore).mockReturnValue(mockStore(mockOpenTab, mockUpdateTab, []));

    const mockScenario = {
      title: 'Test Scenario',
      projectId: { _id: 'proj-123' },
    };

    renderHook(
      () =>
        useWorkspaceTabSync({
          scenarioId: 'scenario-1',
          scenario: mockScenario,
          isDirty: false,
        }),
      { wrapper: createWrapper() }
    );

    expect(mockOpenTab).toHaveBeenCalledWith({
      type: 'scenario',
      scenarioId: 'scenario-1',
      title: 'Test Scenario',
      projectId: 'proj-123',
    });
  });

  it('updates tab dirty state when isDirty changes', () => {
    const mockOpenTab = vi.fn();
    const mockUpdateTab = vi.fn();
    const mockTabs = [{ id: 'tab-1', scenarioId: 'scenario-1', isDirty: false }];

    vi.mocked(useWorkspaceStore).mockReturnValue(mockStore(mockOpenTab, mockUpdateTab, mockTabs));

    const { rerender } = renderHook(
      ({ isDirty }: { isDirty: boolean }) =>
        useWorkspaceTabSync({
          scenarioId: 'scenario-1',
          scenario: { title: 'Test' },
          isDirty,
        }),
      { wrapper: createWrapper(), initialProps: { isDirty: false } }
    );

    // Initially dirty matches, no update needed
    expect(mockUpdateTab).not.toHaveBeenCalled();

    // Change dirty state to trigger update
    rerender({ isDirty: true });

    expect(mockUpdateTab).toHaveBeenCalledWith('tab-1', { isDirty: true });
  });

  it('returns handleTabClick callback', () => {
    const mockOpenTab = vi.fn();
    const mockUpdateTab = vi.fn();

    vi.mocked(useWorkspaceStore).mockReturnValue(mockStore(mockOpenTab, mockUpdateTab, []));

    const { result } = renderHook(
      () =>
        useWorkspaceTabSync({
          scenarioId: 'scenario-1',
          scenario: { title: 'Test' },
          isDirty: false,
        }),
      { wrapper: createWrapper() }
    );

    expect(typeof result.current.handleTabClick).toBe('function');
  });
});
