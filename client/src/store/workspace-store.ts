import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
      name: 'intact-workspace',
      partialize: (state) => ({
        tabs: state.tabs.map((t) => ({ ...t, isDirty: false })),
        activeTabId: state.activeTabId,
      }),
    }
  )
);
