import { useState, useCallback, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  scenariosApi,
  type DeployedServiceResult,
  type ExecuteResult,
  type Scenario,
} from '@/lib/api';
import { validateTopology, getValidationErrorMessage } from '@/lib/topology-validation';
import { toast } from 'sonner';

export interface UseScenarioTopologyOptions {
  scenarioId: string;
  scenario: Scenario | undefined;
  selectedInfrastructure: string | null;
  onInfrastructureChange: (infrastructureId: string | null) => void;
}

export function useScenarioTopology({
  scenarioId,
  scenario,
  selectedInfrastructure,
  onInfrastructureChange,
}: UseScenarioTopologyOptions) {
  const queryClient = useQueryClient();

  // Topology state
  const [yaml, setYaml] = useState('');
  const [nodes, setNodes] = useState<object[]>([]);
  const [edges, setEdges] = useState<object[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // Execution state
  const [activeExecution, setActiveExecution] = useState<{
    executionId: string;
    namespace: string;
    services: DeployedServiceResult[];
  } | null>(null);

  // Initialize local state from scenario
  useEffect(() => {
    if (scenario) {
      setYaml(scenario.topology?.yaml || '');
      setNodes(scenario.topology?.nodes || []);
      setEdges(scenario.topology?.edges || []);
      setIsDirty(false);
    }
  }, [scenario]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      scenariosApi.update(scenarioId, data as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenario', scenarioId] });
      toast.success('Topology saved successfully');
      setIsDirty(false);
    },
    onError: (error: Error) => {
      toast.error(`Failed to save topology: ${error.message}`);
    },
  });

  const handleYamlChange = useCallback((newYaml: string) => {
    setYaml(newYaml);
    setIsDirty(true);
  }, []);

  const handleNodesChange = useCallback((newNodes: object[]) => {
    setNodes(newNodes);
    setIsDirty(true);
  }, []);

  const handleEdgesChange = useCallback((newEdges: object[]) => {
    setEdges(newEdges);
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    updateMutation.mutate({
      topology: { yaml, nodes, edges },
    });
  }, [updateMutation, yaml, nodes, edges]);

  const handleValidate = useCallback(() => {
    const result = validateTopology(selectedInfrastructure, nodes, edges);
    if (result.isValid) {
      toast.success('Configuration is valid');
    } else {
      const errorMsg = getValidationErrorMessage(result);
      toast.error(errorMsg || 'Configuration is not valid');
    }
  }, [selectedInfrastructure, nodes, edges]);

  const handleExecutionStart = useCallback((result: ExecuteResult) => {
    setActiveExecution({
      executionId: result.executionId,
      namespace: result.namespace,
      services: result.services,
    });
  }, []);

  const handleCloseExecution = useCallback(() => {
    setActiveExecution(null);
  }, []);

  return {
    // State
    yaml,
    nodes,
    edges,
    isDirty,
    activeExecution,

    // Actions
    handleYamlChange,
    handleNodesChange,
    handleEdgesChange,
    handleSave,
    handleValidate,
    handleExecutionStart,
    handleCloseExecution,
    onInfrastructureChange,

    // Mutation state
    isSaving: updateMutation.isPending,
  };
}
