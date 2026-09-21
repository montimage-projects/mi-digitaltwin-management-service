import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '@/store/workspace-store';
import type { Scenario } from '@/lib/api';

export interface UseWorkspaceTabSyncOptions {
  scenarioId: string;
  scenario: Scenario | undefined;
  isDirty: boolean;
}

export function useWorkspaceTabSync({ scenarioId, scenario, isDirty }: UseWorkspaceTabSyncOptions) {
  const navigate = useNavigate();
  const { openTab, updateTab, tabs } = useWorkspaceStore();

  // Extract project info from scenario
  const projectId =
    scenario?.projectId && typeof scenario.projectId === 'object'
      ? (scenario.projectId as { _id?: string })._id
      : undefined;

  const scenarioTitle = (scenario?.title as string | undefined) ?? '';

  // Add scenario to workspace tabs when loaded
  useEffect(() => {
    if (scenario && scenarioId) {
      openTab({
        type: 'scenario',
        scenarioId,
        title: scenarioTitle,
        projectId,
      });
    }
  }, [scenario, scenarioId, openTab, scenarioTitle, projectId]);

  // Update tab dirty state
  useEffect(() => {
    if (scenarioId && isDirty !== undefined) {
      const currentTab = tabs.find((t) => t.scenarioId === scenarioId);
      if (currentTab && currentTab.isDirty !== isDirty) {
        updateTab(currentTab.id, { isDirty });
      }
    }
  }, [isDirty, scenarioId]);

  const handleTabClick = useCallback(
    (tab: { scenarioId: string }) => {
      if (tab.scenarioId !== scenarioId) {
        navigate(`/scenarios/${tab.scenarioId}`);
      }
    },
    [navigate, scenarioId]
  );

  return {
    handleTabClick,
  };
}
