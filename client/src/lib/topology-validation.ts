/**
 * Topology validation utility for scenario configurations
 * Ensures topologies meet minimum requirements before deployment
 */

interface TopologyNode {
  id: string;
  data?: {
    serviceId?: string;
    label?: string;
    repositoryTable?: 'INTACT_TOOLBOX' | 'OTHER_SERVICES';
  };
}

interface TopologyEdge {
  id: string;
  source: string;
  target: string;
}

/**
 * Represents the result of topology validation
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Validates a scenario topology configuration
 * Checks that:
 * 1. Target infrastructure is selected
 * 2. At least one Critical Infrastructure Service (Target from OTHER_SERVICES) exists
 * 3. At least one INTACT tool (INTACT_TOOLBOX) exists
 * 4. At least one edge (connection between services) exists
 *
 * @param infrastructure - Selected infrastructure ID or null
 * @param nodes - Array of topology nodes
 * @param edges - Array of topology edges
 * @returns ValidationResult with isValid flag and error messages
 */
export function validateTopology(
  infrastructure: string | null | undefined,
  nodes: object[] | undefined,
  edges: object[] | undefined = []
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Rule 1: Infrastructure must be selected
  if (!infrastructure) {
    errors.push('Select a target infrastructure before deploying');
  }

  // Rule 2: At least one Critical Infrastructure Service (Target) must exist
  const targetServices = (nodes || []).filter((node) => {
    const typedNode = node as TopologyNode;
    return typedNode.data?.repositoryTable === 'OTHER_SERVICES';
  });

  if (targetServices.length === 0) {
    errors.push('Add at least one Critical Infrastructure Service (Target) to the topology');
  }

  // Rule 3: At least one INTACT tool must exist
  const intactTools = (nodes || []).filter((node) => {
    const typedNode = node as TopologyNode;
    return typedNode.data?.repositoryTable === 'INTACT_TOOLBOX';
  });

  if (intactTools.length === 0) {
    errors.push('Add at least one INTACT tool to the topology');
  }

  // Rule 4: At least one edge must exist
  const edgeList = (edges || []) as TopologyEdge[];
  if (edgeList.length === 0) {
    errors.push('Create at least one connection (edge) between services');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Gets human-readable validation error message for UI display
 * Returns the first error if multiple errors exist
 *
 * @param result - ValidationResult from validateTopology
 * @returns First error message or null if valid
 */
export function getValidationErrorMessage(result: ValidationResult): string | null {
  return result.errors.length > 0 ? result.errors[0] : null;
}

/**
 * Checks if topology is valid for deployment
 * Convenience function for boolean checks
 *
 * @param infrastructure - Selected infrastructure ID or null
 * @param nodes - Array of topology nodes
 * @param edges - Array of topology edges
 * @returns true if topology is valid, false otherwise
 */
export function isTopologyValid(
  infrastructure: string | null | undefined,
  nodes: object[] | undefined,
  edges: object[] | undefined = []
): boolean {
  return validateTopology(infrastructure, nodes, edges).isValid;
}
