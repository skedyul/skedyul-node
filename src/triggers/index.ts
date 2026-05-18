export {
  // Context schemas
  CRMDataSchema,
  SenderContextSchema,
  ThreadContextItemSchema,
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

  // Types
  type CRMData,
  type SenderContext,
  type ThreadContextItem,
  type ParticipantContext,
  type TriggerContext,
  type InputMapping,
  type EventConditions,
  type TriggerConfig,
  type ResolvedTrigger,
  type WorkflowInputDefinition,
  type WorkflowInputSchema,
} from './types'

export {
  // Resolver functions
  evaluateTemplate,
  evaluateCondition,
  resolveInputMappings,
  matchesTrigger,
} from './resolver'
