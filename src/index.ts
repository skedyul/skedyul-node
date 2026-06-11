import { z } from 'zod/v4'

export * from './types'
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
  cron,
  resource,
  ai,
  report,
  configure,
  getConfig,
  runWithConfig,
  createInstanceClient,
} from './core/client'
export type {
  InstanceClient,
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
  // Cron types
  CronSubscribeParams,
  CronSubscribeResult,
  CronSubscriptionItem,
  CronListOptions,
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

// CRM Schema exports (for workplace-level migrations)
export {
  defineSchema,
  validateCRMSchema,
  parseCRMSchema,
  safeParseCRMSchema,
} from './schemas'

// ─────────────────────────────────────────────────────────────────
// Event System (Thread Events)
// ─────────────────────────────────────────────────────────────────
export {
  // Event type schemas
  ThreadEventTypeSchema,
  CustomEventTypeSchema,
  EventTypeSchema,
  ParticipantKindSchema,
  // Event payload schemas
  BaseEventPayloadSchema,
  MessageEventPayloadSchema,
  ParticipantEventPayloadSchema,
  ContextChangedPayloadSchema,
  StatusChangedPayloadSchema,
  ScheduledEventPayloadSchema,
  AgentWorkflowEventPayloadSchema,
  CustomEventPayloadSchema,
  ThreadEventPayloadSchema,
  // Full event schemas
  ThreadEventSchema,
  CreateThreadEventInputSchema,
  // Configuration schemas
  EventSubscriptionSchema,
  EventWaitSchema,
  EventsConfigSchema,
} from './events'

export type {
  ThreadEventType,
  CustomEventType,
  EventType,
  ParticipantKind,
  BaseEventPayload,
  MessageEventPayload,
  ParticipantEventPayload,
  ContextChangedPayload,
  StatusChangedPayload,
  ScheduledEventPayload,
  AgentWorkflowEventPayload,
  CustomEventPayload,
  ThreadEventPayload,
  ThreadEvent,
  CreateThreadEventInput,
  EventSubscription,
  EventWait,
  EventsConfig,
} from './events'

// ─────────────────────────────────────────────────────────────────
// Trigger System (Workflow Bindings)
// ─────────────────────────────────────────────────────────────────
export {
  // Context schemas
  CRMDataSchema,
  SenderContextSchema as TriggerSenderContextSchema,
  ThreadContextItemSchema as TriggerThreadContextItemSchema,
  ParticipantContextSchema,
  TriggerContextSchema,
  // Mapping schemas
  InputMappingSchema,
  EventConditionsSchema,
  // Trigger schemas
  TriggerConfigSchema,
  ResolvedTriggerSchema,
  // Workflow input schemas
  WorkflowInputDefinitionSchema,
  WorkflowInputSchemaSchema,
  // Error class
  TriggerResolutionError,
  // Resolver functions
  evaluateTemplate,
  evaluateCondition,
  resolveInputMappings,
  matchesTrigger,
} from './triggers'

export type {
  CRMData,
  SenderContext as TriggerSenderContext,
  ThreadContextItem as TriggerThreadContextItem,
  ParticipantContext,
  TriggerContext,
  InputMapping,
  EventConditions,
  TriggerConfig,
  ResolvedTrigger,
  WorkflowInputDefinition,
  WorkflowInputSchema as TriggerWorkflowInputSchema,
} from './triggers'

// ─────────────────────────────────────────────────────────────────
// Workflow System (Event-Driven Workflows v2)
// ─────────────────────────────────────────────────────────────────
export {
  // Constants
  WORKFLOW_SCHEMA_VERSION,
  // Schemas
  WorkflowInputSchema as WorkflowYAMLInputSchema,
  WorkflowStepInputSchema,
  WorkflowStepSchema,
  WorkflowRuntimeSchema,
  WorkflowYAMLSchema,
  WorkflowMetadataSchema,
  WorkflowExecutionStatusSchema,
  WorkflowExecutionResultSchema,
  // Helper functions
  defineWorkflowYAML,
  validateWorkflowYAML,
} from './workflows'

export type {
  WorkflowInput as WorkflowYAMLInput,
  WorkflowStepInput,
  WorkflowStep,
  WorkflowRuntime,
  WorkflowYAML,
  WorkflowMetadata,
  WorkflowExecutionStatus,
  WorkflowExecutionResult,
} from './workflows'

// ─────────────────────────────────────────────────────────────────
// Skills System
// ─────────────────────────────────────────────────────────────────
export {
  // Constants
  SKILL_SCHEMA_VERSION,
  // Schemas
  SkillSourceSchema,
  SkillToolRequirementSchema,
  SkillExampleSchema,
  SkillYAMLSchema,
  SkillRefSchema,
  SkillMetadataSchema,
  ResolvedSkillSchema,
  // Helper functions
  defineSkill,
  validateSkillYAML,
  formatSkillInstructions,
} from './skills'

export type {
  SkillSource,
  SkillToolRequirement,
  SkillExample,
  SkillYAML,
  SkillRef,
  SkillMetadata,
  ResolvedSkill,
} from './skills'

// ─────────────────────────────────────────────────────────────────
// Context System (Agent Context Resolution)
// ─────────────────────────────────────────────────────────────────
export {
  // Core Schemas
  CRMContextSchema,
  SenderContextSchema,
  ThreadContextItemSchema,
  ThreadInfoSchema,
  SandboxConfigSchema,
  
  // Agent Context Schemas (unified for sandbox and production)
  SubscriptionSchema,
  AssociationSchema,
  ContactSchema,
  AgentSenderContextSchema,
  AgentThreadContextSchema,
  AgentContextSchema,
  
  // Context Validation Schemas
  ContextIssueSeveritySchema,
  ContextIssueTypeSchema,
  ContextIssueSchema,
  ContextValidationResultSchema,
  
  // Legacy Mock* aliases (deprecated, kept for backwards compatibility)
  MockSenderContextSchema,
  MockThreadContextSchema,
  MockContextSchema,
  
  // Resolver functions
  buildAgentContext,
  formatContextForPrompt,
  getContextByHandle,
  getContextByModel,
  getAssociationByModel,
} from './context'

export type {
  // Core Types
  CRMContext,
  SenderContext,
  ThreadContextItem,
  ThreadInfo,
  SandboxConfig,
  
  // Agent Context Types (unified for sandbox and production)
  Subscription,
  Association,
  Contact,
  AgentSenderContext,
  AgentThreadContext,
  AgentContext,
  
  // Context Validation Types
  ContextIssueSeverity,
  ContextIssueType,
  ContextIssue,
  ContextValidationResult,
  
  // Legacy Mock* type aliases (deprecated)
  MockSenderContext,
  MockThreadContext,
  MockContext,
} from './context'

// ─────────────────────────────────────────────────────────────────
// Memory System (Agent Memory)
// ─────────────────────────────────────────────────────────────────
export {
  // Schemas
  MemoryEntryTypeSchema,
  MemoryEntrySchema,
  WorkingMemoryConfigSchema,
  SemanticMemoryConfigSchema,
  ExternalMemoryConfigSchema,
  MemoryConfigSchema,
  MemoryScopeSchema,
  MemoryQueryOptionsSchema,
  ConversationSummarySchema,
  AgentObservationSchema,
  ExternalDataCacheSchema,
  // Service
  MemoryService,
  InMemoryStore,
  createInMemoryService,
} from './memory'

export type {
  MemoryEntryType,
  MemoryEntry,
  WorkingMemoryConfig as MemoryWorkingConfig,
  SemanticMemoryConfig as MemorySemanticConfig,
  ExternalMemoryConfig as MemoryExternalConfig,
  MemoryConfig,
  MemoryScope,
  MemoryQueryOptions,
  ConversationSummary,
  AgentObservation,
  ExternalDataCache,
  MemoryStore,
} from './memory'

export type {
  CRMFieldType,
  CRMFieldRequirement,
  CRMFieldOption,
  CRMFieldDefinition,
  CRMFieldSchema,
  CRMModelSchema,
  CRMCardinality,
  CRMOnDelete,
  CRMRelationshipLink,
  CRMRelationshipSchema,
  CRMSchema,
  CRMSchemaValidationResult,
} from './schemas'

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
  FilterOperator,
  FilterCondition,
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
  FormActionDefinition,
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

// ─────────────────────────────────────────────────────────────────
// Compiler (YAML to IR)
// ─────────────────────────────────────────────────────────────────
export { compileAgent, compileWorkflow } from './compiler'

export type {
  ValidationError,
  ValidationWarning,
  ResolvedPersona,
  ResolvedTool,
  EventConfig as CompilerEventConfig,
  IRMemoryConfig,
  PolicyConfig,
  IRRuntimeConfig,
  AgentIR,
  WorkflowStepIR,
  WorkflowIR,
  CompilationResult,
} from './compiler'

// ─────────────────────────────────────────────────────────────────
// Scheduling (Time Windows & Wait Calculations)
// ─────────────────────────────────────────────────────────────────
// Zod schemas (for validation in activities, not workflow-safe)
export {
  TimeStampSchema,
  DayOfWeekSchema,
  TimeWindowSlotSchema,
  WaitUnitSchema,
  WaitInputRelativeSchema,
  WaitInputAbsoluteSchema,
  WaitInputSchema,
} from './scheduling/types'

// Functions (workflow-safe)
export {
  calculateWaitTime,
  isTimeInWindowSlot,
  isTimeInPolicy,
} from './scheduling'

// Types (workflow-safe, from types-workflow.ts via scheduling/index.ts)
export type {
  TimeStamp,
  DayOfWeek,
  TimeWindowSlot,
  WaitUnit,
  WaitInputRelative,
  WaitInputAbsolute,
  WaitInputType,
  CalculateWaitTimeResult,
  TimeWindowPolicy,
} from './scheduling'

// Re-export time window types from schemas for workflows
export {
  TimeWindowBehaviorSchema,
  TimeWindowPoliciesSchema,
} from './schemas/agent-schema-v3'

export type {
  TimeWindowBehavior,
  TimeWindowPolicies,
} from './schemas/agent-schema-v3'
