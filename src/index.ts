import { z } from 'zod'

export * from './types'
export * from './schemas'
export { server } from './server'
// Re-export zod so integrations use the same instance
export { z }
export {
  workplace,
  communicationChannel,
  instance,
  token,
  file,
  webhook,
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
  WebhookCreateResult,
  WebhookListItem,
  WebhookDeleteByNameOptions,
  WebhookListOptions,
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
  ChannelToolBindings,
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
  PageInstanceFilter,
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
