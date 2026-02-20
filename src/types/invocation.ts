// ─────────────────────────────────────────────────────────────────────────────
// Invocation Context Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type of invocation that triggered the executable
 */
export type InvocationType = 'tool_call' | 'server_hook' | 'workflow_step' | 'webhook'

/**
 * Server hook handles for lifecycle events
 */
export type ServerHookHandle = 'provision' | 'install' | 'uninstall' | 'oauth_callback'

/**
 * Context for tracking how an executable was invoked.
 * Used for log traceability and filtering.
 */
export interface InvocationContext {
  /** Unique identifier for this invocation */
  invocationId: string
  /** Type of invocation */
  invocationType: InvocationType

  // Tool call context
  /** Unique ID for the tool call (for tool_call invocations) */
  toolCallId?: string
  /** The tool's handle for searching (e.g., "get_customers") */
  toolHandle?: string

  // Server hook context
  /** Hook type: "provision", "install", "uninstall", "oauth_callback" */
  serverHookHandle?: ServerHookHandle

  // App installation context
  /** The app installation that triggered the call */
  appInstallationId?: string

  // Workflow context
  /** The workflow ID (if invoked via workflow) */
  workflowId?: string
  /** The workflow version ID */
  workflowVersionId?: string
  /** The workflow run ID */
  workflowRunId?: string
  /** The workflow step ID */
  workflowStepId?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions for Creating Invocation Context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an invocation context for a tool call
 */
export function createToolCallContext(params: {
  invocationId: string
  toolCallId: string
  toolHandle: string
  appInstallationId?: string
  workflowId?: string
  workflowVersionId?: string
  workflowRunId?: string
}): InvocationContext {
  return {
    invocationId: params.invocationId,
    invocationType: 'tool_call',
    toolCallId: params.toolCallId,
    toolHandle: params.toolHandle,
    appInstallationId: params.appInstallationId,
    workflowId: params.workflowId,
    workflowVersionId: params.workflowVersionId,
    workflowRunId: params.workflowRunId,
  }
}

/**
 * Create an invocation context for a server hook
 */
export function createServerHookContext(params: {
  invocationId: string
  serverHookHandle: ServerHookHandle
  appInstallationId?: string
}): InvocationContext {
  return {
    invocationId: params.invocationId,
    invocationType: 'server_hook',
    serverHookHandle: params.serverHookHandle,
    appInstallationId: params.appInstallationId,
  }
}

/**
 * Create an invocation context for a webhook
 */
export function createWebhookContext(params: {
  invocationId: string
  appInstallationId?: string
}): InvocationContext {
  return {
    invocationId: params.invocationId,
    invocationType: 'webhook',
    appInstallationId: params.appInstallationId,
  }
}

/**
 * Create an invocation context for a workflow step
 */
export function createWorkflowStepContext(params: {
  invocationId: string
  workflowId: string
  workflowVersionId: string
  workflowRunId: string
  workflowStepId?: string
}): InvocationContext {
  return {
    invocationId: params.invocationId,
    invocationType: 'workflow_step',
    workflowId: params.workflowId,
    workflowVersionId: params.workflowVersionId,
    workflowRunId: params.workflowRunId,
    workflowStepId: params.workflowStepId,
  }
}
