export {
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
} from './types'

export type {
  MemoryEntryType,
  MemoryEntry,
  WorkingMemoryConfig,
  SemanticMemoryConfig,
  ExternalMemoryConfig,
  MemoryConfig,
  MemoryScope,
  MemoryQueryOptions,
  ConversationSummary,
  AgentObservation,
  ExternalDataCache,
} from './types'

export {
  MemoryService,
  InMemoryStore,
  createInMemoryService,
} from './service'

export type { MemoryStore } from './service'
