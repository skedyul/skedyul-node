/**
 * Types module - re-exports all types from domain-specific files
 * 
 * This maintains backward compatibility while organizing types
 * into smaller, focused modules.
 */

// Shared types
export type { AppInfo, AppInfoWithHandles, WorkplaceInfo, RequestInfo } from './shared'

// Invocation context types
export type {
  InvocationType,
  ServerHookHandle,
  InvocationContext,
} from './invocation'
export {
  createToolCallContext,
  createServerHookContext,
  createWebhookContext,
  createWorkflowStepContext,
} from './invocation'

// Tool context types
export type {
  ToolTrigger,
  ProvisionToolContext,
  FieldChangeToolContext,
  PageActionToolContext,
  FormSubmitToolContext,
  AgentToolContext,
  WorkflowToolContext,
  ToolExecutionContext,
} from './tool-context'
export { isProvisionContext, isRuntimeContext } from './tool-context'

// Tool types
export type {
  // New discriminated union types
  ToolResult,
  ToolSuccess,
  ToolFailure,
  ErrorCode,
  ErrorCategory,
  ToolWarning,
  ToolPagination,
  ToolBilling,
  ToolRetry,
  ToolTiming,
  // Legacy types (backward compatibility)
  BillingInfo,
  ToolResponseMeta,
  ToolEffect,
  ToolError,
  ToolExecutionResult,
  ToolSchemaWithJson,
  ToolSchema,
  ToolHandler,
  ToolDefinition,
  ToolRegistryEntry,
  ToolRegistry,
  ToolName,
  ToolMetadata,
  ToolCallResponse,
} from './tool'
export { ToolResponseMetaSchema } from './tool'

// Tool response helpers
export {
  // Success helpers
  createSuccessResponse,
  createListResponse,
  // Error helpers
  createErrorResponse,
  createValidationError,
  createNotFoundError,
  createAuthError,
  createRateLimitError,
  createExternalError,
  createTimeoutError,
  createPermissionError,
  createConflictError,
  // Type guards
  isSuccess,
  isFailure,
  isRetryable,
  getRetryDelay,
} from './tool-response'

// Server types
export type {
  HealthStatus,
  ComputeLayer,
  DedicatedServerInstance,
  ServerlessServerInstance,
  SkedyulServerInstance,
} from './server'

// Handler types
export type {
  InstallHandlerContext,
  InstallHandlerResponseOAuth,
  InstallHandlerResponseStandard,
  HasOAuthCallback,
  InstallHandlerResult,
  InstallHandler,
  UninstallHandlerContext,
  UninstallHandlerResult,
  UninstallHandler,
  OAuthCallbackContext,
  OAuthCallbackResult,
  OAuthCallbackHandler,
  ProvisionHandlerContext,
  ProvisionHandlerResult,
  ProvisionHandler,
  ServerHooksWithOAuth,
  ServerHooksWithoutOAuth,
  ServerHooks,
} from './handlers'

// AWS types
export type { APIGatewayProxyEvent, APIGatewayProxyResult } from './aws'

// Webhook types
export type {
  WebhookWireRequest,
  HandlerRawRequest,
  WebhookRequest,
  WebhookResponse,
  ProvisionWebhookContext,
  RuntimeWebhookContext,
  WebhookContext,
  WebhookHandler,
  WebhookLifecycleContext,
  CommunicationChannelLifecycleContext,
  WebhookLifecycleResult,
  WebhookLifecycleHook,
  WebhookInvocationMode,
  WebhookType,
  WebhookDefinition,
  WebhookRegistry,
  WebhookName,
  WebhookMetadata,
} from './webhook'
export { isRuntimeWebhookContext } from './webhook'

// MCP Protocol types
export type {
  MCPError,
  MCPContentItem,
  MCPResult,
  MCPResponse,
  MCPRequest,
} from './mcp-protocol'
