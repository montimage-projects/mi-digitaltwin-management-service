import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

const WORKSPACE_STORAGE_KEY = 'montimage-workspace';
const LEGACY_WORKSPACE_STORAGE_KEY = 'intact-workspace';

/**
 * Rebrand migration: the persist key was renamed from 'intact-workspace' to
 * 'montimage-workspace'. On first read under the new key, fall back to the
 * old key (if present) so existing users don't silently lose their open
 * tabs, then copy the data over and clean up the legacy entry.
 */
const workspaceStorage: StateStorage = {
  getItem: (name) => {
    const value = localStorage.getItem(name);
    if (value !== null) {
      return value;
    }

    const legacyValue = localStorage.getItem(LEGACY_WORKSPACE_STORAGE_KEY);
    if (legacyValue === null) {
      return null;
    }

    localStorage.setItem(name, legacyValue);
    localStorage.removeItem(LEGACY_WORKSPACE_STORAGE_KEY);
    return legacyValue;
  },
  setItem: (name, value) => localStorage.setItem(name, value),
  removeItem: (name) => localStorage.removeItem(name),
};

export interface WorkspaceTab {
  id: string;
  type: 'scenario';
  scenarioId: string;
  title: string;
  projectId?: string;
  isDirty?: boolean;
}

interface WorkspaceState {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  openTab: (tab: Omit<WorkspaceTab, 'id'>) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<WorkspaceTab>) => void;
  closeAllTabs: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      openTab: (tabData) => {
        const { tabs } = get();
        // Check if tab already exists
        const existingTab = tabs.find(
          (t) => t.type === tabData.type && t.scenarioId === tabData.scenarioId
        );

        if (existingTab) {
          set({ activeTabId: existingTab.id });
          return;
        }

        const newTab: WorkspaceTab = {
          ...tabData,
          id: `${tabData.type}-${tabData.scenarioId}-${Date.now()}`,
        };

        set({
          tabs: [...tabs, newTab],
          activeTabId: newTab.id,
        });
      },

      closeTab: (tabId) => {
        const { tabs, activeTabId } = get();
        const tabIndex = tabs.findIndex((t) => t.id === tabId);
        const newTabs = tabs.filter((t) => t.id !== tabId);

        let newActiveTabId = activeTabId;
        if (activeTabId === tabId) {
          // Activate adjacent tab
          if (newTabs.length > 0) {
            const newIndex = Math.min(tabIndex, newTabs.length - 1);
            newActiveTabId = newTabs[newIndex].id;
          } else {
            newActiveTabId = null;
          }
        }

        set({ tabs: newTabs, activeTabId: newActiveTabId });
      },

      setActiveTab: (tabId) => {
        set({ activeTabId: tabId });
      },

      updateTab: (tabId, updates) => {
        set({
          tabs: get().tabs.map((t) => (t.id === tabId ? { ...t, ...updates } : t)),
        });
      },

      closeAllTabs: () => {
        set({ tabs: [], activeTabId: null });
      },
    }),
    {
      name: WORKSPACE_STORAGE_KEY,
      storage: createJSONStorage(() => workspaceStorage),
      partialize: (state) => ({
        tabs: state.tabs.map((t) => ({ ...t, isDirty: false })),
        activeTabId: state.activeTabId,
      }),
    }
  )
);
