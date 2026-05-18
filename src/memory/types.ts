import { z } from 'zod/v4'

/**
 * Memory entry types
 */
export const MemoryEntryTypeSchema = z.enum([
  'WORKING',      // Current conversation context
  'OBSERVATION',  // Agent inferences/observations
  'EXTERNAL',     // External API data cache
  'SEMANTIC',     // Semantic memory for retrieval
])

export type MemoryEntryType = z.infer<typeof MemoryEntryTypeSchema>

/**
 * Memory entry schema
 */
export const MemoryEntrySchema = z.object({
  id: z.string(),
  type: MemoryEntryTypeSchema,
  key: z.string(),
  value: z.unknown(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  expiresAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>

/**
 * Working memory configuration
 */
export const WorkingMemoryConfigSchema = z.object({
  strategy: z.enum(['full', 'rolling_summary', 'sliding_window']).default('rolling_summary'),
  maxTokens: z.number().default(8000),
  summarizeAt: z.number().optional(),
  ttl: z.string().optional(),
})

export type WorkingMemoryConfig = z.infer<typeof WorkingMemoryConfigSchema>

/**
 * Semantic memory configuration
 */
export const SemanticMemoryConfigSchema = z.object({
  enabled: z.boolean().default(false),
  topK: z.number().default(5),
  scope: z.enum(['thread', 'instance', 'workspace']).default('thread'),
  minScore: z.number().default(0.7),
})

export type SemanticMemoryConfig = z.infer<typeof SemanticMemoryConfigSchema>

/**
 * External memory configuration
 */
export const ExternalMemoryConfigSchema = z.object({
  namespace: z.string(),
  ttl: z.string().optional(),
})

export type ExternalMemoryConfig = z.infer<typeof ExternalMemoryConfigSchema>

/**
 * Full memory configuration
 */
export const MemoryConfigSchema = z.object({
  working: WorkingMemoryConfigSchema.optional(),
  semantic: SemanticMemoryConfigSchema.optional(),
  external: ExternalMemoryConfigSchema.optional(),
  persistent: z.object({
    namespace: z.string(),
  }).optional(),
})

export type MemoryConfig = z.infer<typeof MemoryConfigSchema>

/**
 * Memory scope for queries
 */
export const MemoryScopeSchema = z.object({
  threadId: z.string().optional(),
  participantId: z.string().optional(),
  agentId: z.string().optional(),
  workplaceId: z.string().optional(),
  namespace: z.string().optional(),
})

export type MemoryScope = z.infer<typeof MemoryScopeSchema>

/**
 * Memory query options
 */
export const MemoryQueryOptionsSchema = z.object({
  types: z.array(MemoryEntryTypeSchema).optional(),
  keys: z.array(z.string()).optional(),
  limit: z.number().default(100),
  includeExpired: z.boolean().default(false),
})

export type MemoryQueryOptions = z.infer<typeof MemoryQueryOptionsSchema>

/**
 * Conversation summary for working memory
 */
export const ConversationSummarySchema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()),
  entities: z.array(z.object({
    name: z.string(),
    type: z.string(),
    relevance: z.number(),
  })),
  lastMessageId: z.string().optional(),
  messageCount: z.number(),
  tokenCount: z.number(),
  createdAt: z.string().datetime(),
})

export type ConversationSummary = z.infer<typeof ConversationSummarySchema>

/**
 * Agent observation
 */
export const AgentObservationSchema = z.object({
  observation: z.string(),
  confidence: z.number().min(0).max(1),
  source: z.enum(['inference', 'explicit', 'tool_result']),
  context: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime(),
})

export type AgentObservation = z.infer<typeof AgentObservationSchema>

/**
 * External data cache entry
 */
export const ExternalDataCacheSchema = z.object({
  source: z.string(),
  endpoint: z.string().optional(),
  data: z.unknown(),
  fetchedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type ExternalDataCache = z.infer<typeof ExternalDataCacheSchema>
