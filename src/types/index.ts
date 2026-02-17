/**
 * Types module - re-exports all types from domain-specific files
 * 
 * This maintains backward compatibility while organizing types
 * into smaller, focused modules.
 */

// Shared types
export type { AppInfo, WorkplaceInfo, RequestInfo } from './shared'

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
  ProvisionToolInput,
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

// Server types
export type {
  HealthStatus,
  ComputeLayer,
  ServerMetadata,
  CorsOptions,
  SkedyulServerConfig,
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
  WebhookType,
  WebhookDefinition,
  WebhookRegistry,
  WebhookName,
  WebhookMetadata,
} from './webhook'
export { isRuntimeWebhookContext } from './webhook'
