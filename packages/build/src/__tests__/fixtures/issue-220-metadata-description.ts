export interface NestedApiMetadataDetails {
  /**
   * Nested status shown in the dashboard
   * @apiName nested_workflow_status
   */
  nestedWorkflowStatus: string;
}

export interface MetadataDescriptionRegression {
  /**
   * Inline status shown in the dashboard
   * @apiName workflow_status
   */
  workflowStatus: string;

  /**
   * Inline summary for a labeled field
   * @displayName Workflow Status
   */
  workflowState: string;

  nested: NestedApiMetadataDetails;
}
