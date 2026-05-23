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
  MockSubscriptionSchema,
  MockAssociationSchema,
  MockContactSchema,
  MockSenderContextSchema,
  MockThreadContextSchema,
  MockContextSchema,

  // Core Types
  type CRMContext,
  type SenderContext,
  type ThreadContextItem,
  type ThreadInfo,
  type SandboxConfig,
  
  // Agent Context Types (unified for sandbox and production)
  type Subscription,
  type Association,
  type Contact,
  type AgentSenderContext,
  type AgentThreadContext,
  type AgentContext,
  
  // Context Validation Types
  type ContextIssueSeverity,
  type ContextIssueType,
  type ContextIssue,
  type ContextValidationResult,
  
  // Legacy Mock* type aliases (deprecated)
  type MockSubscription,
  type MockAssociation,
  type MockContact,
  type MockSenderContext,
  type MockThreadContext,
  type MockContext,
} from './types'

export {
  // Resolver functions
  buildAgentContext,
  formatContextForPrompt,
  getContextByHandle,
  getContextByModel,
  getAssociationByModel,
} from './resolver'
