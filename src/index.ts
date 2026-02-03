import { z } from 'zod'

export * from './types'
export * from './schemas'
export { server } from './server'
export { DEFAULT_DOCKERFILE } from './dockerfile'
// Re-export zod so integrations use the same instance
export { z }
export {
  workplace,
  communicationChannel,
  instance,
  token,
  file,
  webhook,
  resource,
  contactAssociationLink,
  configure,
  getConfig,
  runWithConfig,
} from './core/client'
export type {
  InstanceContext,
  InstanceData,
  InstanceMeta,
  InstancePagination,
  InstanceListResult,
  InstanceListArgs,
  FileUrlResponse,
  FileUploadParams,
  FileUploadResult,
  WebhookCreateResult,
  WebhookListItem,
  WebhookDeleteByNameOptions,
  WebhookListOptions,
  ResourceLinkParams,
  ResourceLinkResult,
  ContactAssociationLinkCreateParams,
  ContactAssociationLinkCreateResult,
} from './core/client'

// Default export for ESM compatibility when importing from CJS
export default { z }
export {
  defineConfig,
  loadConfig,
  validateConfig,
  CONFIG_FILE_NAMES,
  getAllEnvKeys,
  getRequiredInstallEnvKeys,
} from './config'
export type {
  SkedyulConfig,
  SerializableSkedyulConfig,
  EnvVariableDefinition,
  EnvSchema,
  EnvVisibility,
  ComputeLayerType,
  // Install handler types
  InstallHandlerContext,
  InstallHandlerResult,
  InstallHandler,
  // Provision handler types
  ProvisionHandlerContext,
  ProvisionHandlerResult,
  ProvisionHandler,
  // Install config types
  InstallConfig,
  // Model types
  ModelDefinition,
  ModelFieldDefinition,
  ResourceScope,
  FieldOwner,
  InternalFieldDataType,
  FieldOption,
  InlineFieldDefinition,
  AppFieldVisibility,
  // Relationship types
  RelationshipDefinition,
  RelationshipLink,
  RelationshipCardinality,
  OnDeleteBehavior,
  // Channel types
  ChannelDefinition,
  ChannelCapability,
  ChannelCapabilityType,
  ChannelFieldDefinition,
  // Workflow types
  WorkflowDefinition,
  WorkflowAction,
  WorkflowActionInput,
  // Page types
  PageDefinition,
  PageBlockDefinition,
  PageFieldDefinition,
  PageActionDefinition,
  PageType,
  PageBlockType,
  PageFieldType,
  PageFieldSource,
  PageFormHeader,
  PageContextMode,
  PageContextItemDefinition,
  PageContextDefinition,
  PageInstanceFilter,
  // Navigation types
  NavigationItem,
  NavigationSection,
  NavigationSidebar,
  BreadcrumbItem,
  NavigationBreadcrumb,
  NavigationConfig,
  // Webhook handler types
  WebhookHttpMethod,
  WebhookRequest,
  WebhookHandlerContext,
  WebhookHandlerResponse,
  WebhookHandlerFn,
  WebhookHandlerDefinition,
  Webhooks,
  WebhookHandlerMetadata,
  // Provision config
  ProvisionConfig,
  // Dependency types
  ModelDependency,
  ChannelDependency,
  WorkflowDependency,
  ResourceDependency,
  StructuredFilter,
} from './config'
