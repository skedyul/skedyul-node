import { z } from 'zod/v4'

export * from './types'
export { ToolResponseMetaSchema } from './types'
export * from './schemas'
export { server } from './server'
export { DEFAULT_DOCKERFILE } from './dockerfile'
// Install handler errors
export {
  InstallError,
  MissingRequiredFieldError,
  AuthenticationError,
  InvalidConfigurationError,
  ConnectionError,
  AppAuthInvalidError,
} from './errors'
export type { InstallErrorCode } from './errors'
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
  ai,
  report,
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
  FileInfo,
  FileUrlResponse,
  FileUploadParams,
  FileUploadResult,
  WebhookCreateResult,
  WebhookListItem,
  WebhookDeleteByNameOptions,
  WebhookListOptions,
  ResourceLinkParams,
  ResourceLinkResult,
  // AI types
  AITextContent,
  AIFileContent,
  AIImageContent,
  AIMessageContent,
  AIMessage,
  GenerateObjectOptions,
  GenerateObjectResult,
  // Report types
  ReportGenerateParams,
  ReportGenerateResult,
  ReportDefineParams,
  ReportDefineResult,
  ReportListParams,
  ReportListItem,
  ReportListResult,
  ReportDefinition,
} from './core/client'
// Context-aware logger
export { createContextLogger } from './server/logger'
export type { ContextLogger } from './server/logger'

// Default export for ESM compatibility when importing from CJS
export default { z }

// Config exports
export {
  defineConfig,
  defineModel,
  defineChannel,
  definePage,
  defineWorkflow,
  defineAgent,
  defineEnv,
  defineNavigation,
  loadConfig,
  validateConfig,
  CONFIG_FILE_NAMES,
  getAllEnvKeys,
  getRequiredInstallEnvKeys,
} from './config'

export type {
  // App config
  SkedyulConfig,
  SerializableSkedyulConfig,
  InstallConfig,
  ProvisionConfig,
  // Base types
  BaseDefinition,
  Scope,
  FieldOwner,
  Visibility,
  ComputeLayer,
  StructuredFilter,
  FieldOption,
  // Env types
  EnvVariable,
  EnvSchema,
  // Model types
  FieldType,
  Cardinality,
  OnDelete,
  InlineFieldDefinition,
  FieldVisibility,
  FieldDefinition,
  ModelDefinition,
  RelationshipLink,
  RelationshipDefinition,
  // Channel types
  CapabilityType,
  ChannelCapability,
  ChannelFieldPermissions,
  ChannelField,
  ChannelDefinition,
  // Workflow types
  WorkflowActionInput,
  WorkflowAction,
  WorkflowDefinition,
  // Agent types
  AgentDefinition,
  // Navigation types
  NavigationItem,
  NavigationSection,
  NavigationSidebar,
  BreadcrumbItem,
  NavigationBreadcrumb,
  NavigationConfig,
  // Context types
  ContextMode,
  ContextItemModel,
  ContextItemTool,
  ContextItem,
  ContextDefinition,
  // Form types
  FormStyleProps,
  ButtonVariant,
  ButtonSize,
  ButtonProps,
  RelationshipExtension,
  FormHeader,
  ActionDefinition,
  ModalFormDefinition,
  InputComponent,
  TextareaComponent,
  SelectComponent,
  ComboboxComponent,
  CheckboxComponent,
  DatePickerComponent,
  TimePickerComponent,
  StatusIndicator,
  FieldSettingComponent,
  ImageSettingComponent,
  FileSettingComponent,
  ListItemTemplate,
  ListComponent,
  EmptyFormComponent,
  AlertComponent,
  FormComponent,
  FormLayoutColumn,
  FormLayoutRow,
  FormLayoutConfig,
  FormProps,
  CardHeader,
  CardBlock,
  ListBlock,
  ModelMapperBlock,
  BlockDefinition,
  // Page types
  PageType,
  PageDefinition,
  // Webhook types
  HttpMethod,
  WebhookRequest,
  WebhookHandlerContext,
  WebhookHandlerResponse,
  WebhookHandlerFn,
  WebhookHandlerDefinition,
  Webhooks,
  WebhookHandlerMetadata,
  // Resource dependency types
  ModelDependency,
  ChannelDependency,
  WorkflowDependency,
  ResourceDependency,
} from './config'
