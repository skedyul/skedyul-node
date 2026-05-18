import type {
  MemoryScope,
  MemoryEntry,
  MemoryEntryType,
  MemoryQueryOptions,
  ConversationSummary,
  AgentObservation,
  ExternalDataCache,
  WorkingMemoryConfig,
} from './types'

/**
 * Memory store interface - implemented by database or in-memory store
 */
export interface MemoryStore {
  get(scope: MemoryScope, key: string): Promise<MemoryEntry | null>
  set(scope: MemoryScope, key: string, value: unknown, options?: {
    type?: MemoryEntryType
    expiresAt?: Date
    metadata?: Record<string, unknown>
  }): Promise<MemoryEntry>
  delete(scope: MemoryScope, key: string): Promise<void>
  query(scope: MemoryScope, options?: Partial<MemoryQueryOptions>): Promise<MemoryEntry[]>
  clear(scope: MemoryScope, type?: MemoryEntryType): Promise<void>
}

/**
 * In-memory store for testing and development
 */
export class InMemoryStore implements MemoryStore {
  private store = new Map<string, MemoryEntry>()

  private buildKey(scope: MemoryScope, key: string): string {
    const parts = [
      scope.workplaceId,
      scope.threadId,
      scope.participantId,
      scope.agentId,
      scope.namespace,
      key,
    ].filter(Boolean)
    return parts.join(':')
  }

  async get(scope: MemoryScope, key: string): Promise<MemoryEntry | null> {
    const fullKey = this.buildKey(scope, key)
    const entry = this.store.get(fullKey)
    
    if (!entry) return null
    
    if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
      this.store.delete(fullKey)
      return null
    }
    
    return entry
  }

  async set(
    scope: MemoryScope,
    key: string,
    value: unknown,
    options?: {
      type?: MemoryEntryType
      expiresAt?: Date
      metadata?: Record<string, unknown>
    },
  ): Promise<MemoryEntry> {
    const fullKey = this.buildKey(scope, key)
    const now = new Date().toISOString()
    
    const entry: MemoryEntry = {
      id: fullKey,
      type: options?.type ?? 'WORKING',
      key,
      value,
      metadata: options?.metadata,
      expiresAt: options?.expiresAt?.toISOString(),
      createdAt: this.store.get(fullKey)?.createdAt ?? now,
      updatedAt: now,
    }
    
    this.store.set(fullKey, entry)
    return entry
  }

  async delete(scope: MemoryScope, key: string): Promise<void> {
    const fullKey = this.buildKey(scope, key)
    this.store.delete(fullKey)
  }

  async query(scope: MemoryScope, options?: Partial<MemoryQueryOptions>): Promise<MemoryEntry[]> {
    const prefix = this.buildKey(scope, '')
    const results: MemoryEntry[] = []
    const now = new Date()
    
    for (const [key, entry] of this.store.entries()) {
      if (!key.startsWith(prefix)) continue
      
      if (!options?.includeExpired && entry.expiresAt && new Date(entry.expiresAt) < now) {
        continue
      }
      
      if (options?.types && !options.types.includes(entry.type)) {
        continue
      }
      
      if (options?.keys && !options.keys.includes(entry.key)) {
        continue
      }
      
      results.push(entry)
      
      if (results.length >= (options?.limit ?? 100)) {
        break
      }
    }
    
    return results
  }

  async clear(scope: MemoryScope, type?: MemoryEntryType): Promise<void> {
    const prefix = this.buildKey(scope, '')
    
    for (const [key, entry] of this.store.entries()) {
      if (!key.startsWith(prefix)) continue
      if (type && entry.type !== type) continue
      this.store.delete(key)
    }
  }
}

/**
 * Memory service for agent memory management
 */
export class MemoryService {
  constructor(private store: MemoryStore) {}

  /**
   * Get working memory for a thread/participant
   */
  async getWorkingMemory(scope: MemoryScope): Promise<ConversationSummary | null> {
    const entry = await this.store.get(scope, 'working:summary')
    if (!entry) return null
    return entry.value as ConversationSummary
  }

  /**
   * Update working memory with new conversation summary
   */
  async updateWorkingMemory(
    scope: MemoryScope,
    summary: ConversationSummary,
    config?: WorkingMemoryConfig,
  ): Promise<void> {
    const ttl = config?.ttl ? parseDuration(config.ttl) : undefined
    const expiresAt = ttl ? new Date(Date.now() + ttl) : undefined

    await this.store.set(scope, 'working:summary', summary, {
      type: 'WORKING',
      expiresAt,
      metadata: { config },
    })
  }

  /**
   * Add an observation to memory
   */
  async addObservation(
    scope: MemoryScope,
    observation: Omit<AgentObservation, 'createdAt'>,
  ): Promise<void> {
    const key = `observation:${Date.now()}`
    const entry: AgentObservation = {
      ...observation,
      createdAt: new Date().toISOString(),
    }

    await this.store.set(scope, key, entry, {
      type: 'OBSERVATION',
    })
  }

  /**
   * Get all observations for a scope
   */
  async getObservations(
    scope: MemoryScope,
    limit = 50,
  ): Promise<AgentObservation[]> {
    const entries = await this.store.query(scope, {
      types: ['OBSERVATION'],
      limit,
    })

    return entries
      .map((e) => e.value as AgentObservation)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  /**
   * Cache external API data
   */
  async cacheExternalData(
    scope: MemoryScope,
    source: string,
    data: unknown,
    options?: {
      endpoint?: string
      ttl?: string
      metadata?: Record<string, unknown>
    },
  ): Promise<void> {
    const key = `external:${source}`
    const ttl = options?.ttl ? parseDuration(options.ttl) : 3600000 // Default 1 hour
    const expiresAt = new Date(Date.now() + ttl)

    const entry: ExternalDataCache = {
      source,
      endpoint: options?.endpoint,
      data,
      fetchedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      metadata: options?.metadata,
    }

    await this.store.set(scope, key, entry, {
      type: 'EXTERNAL',
      expiresAt,
    })
  }

  /**
   * Get cached external data
   */
  async getExternalData(
    scope: MemoryScope,
    source: string,
  ): Promise<ExternalDataCache | null> {
    const entry = await this.store.get(scope, `external:${source}`)
    if (!entry) return null
    return entry.value as ExternalDataCache
  }

  /**
   * Clear all external data cache
   */
  async clearExternalCache(scope: MemoryScope): Promise<void> {
    await this.store.clear(scope, 'EXTERNAL')
  }

  /**
   * Build context string from memory for LLM prompt
   */
  async buildMemoryContext(scope: MemoryScope): Promise<string> {
    const sections: string[] = []

    const workingMemory = await this.getWorkingMemory(scope)
    if (workingMemory) {
      sections.push(`## Conversation Summary\n${workingMemory.summary}`)
      
      if (workingMemory.keyPoints.length > 0) {
        sections.push(`### Key Points\n${workingMemory.keyPoints.map((p) => `- ${p}`).join('\n')}`)
      }
    }

    const observations = await this.getObservations(scope, 10)
    if (observations.length > 0) {
      const highConfidence = observations.filter((o) => o.confidence >= 0.7)
      if (highConfidence.length > 0) {
        sections.push(
          `## Observations\n${highConfidence.map((o) => `- ${o.observation} (confidence: ${Math.round(o.confidence * 100)}%)`).join('\n')}`,
        )
      }
    }

    const externalEntries = await this.store.query(scope, {
      types: ['EXTERNAL'],
      limit: 5,
    })
    if (externalEntries.length > 0) {
      const externalSections = externalEntries.map((e) => {
        const cache = e.value as ExternalDataCache
        return `### ${cache.source}\n${JSON.stringify(cache.data, null, 2)}`
      })
      sections.push(`## External Data\n${externalSections.join('\n\n')}`)
    }

    return sections.join('\n\n')
  }
}

/**
 * Parse duration string to milliseconds
 * Supports: 1h, 2d, 30m, 1w
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([hdmw])$/)
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`)
  }

  const value = parseInt(match[1], 10)
  const unit = match[2]

  switch (unit) {
    case 'm':
      return value * 60 * 1000
    case 'h':
      return value * 60 * 60 * 1000
    case 'd':
      return value * 24 * 60 * 60 * 1000
    case 'w':
      return value * 7 * 24 * 60 * 60 * 1000
    default:
      throw new Error(`Unknown duration unit: ${unit}`)
  }
}

/**
 * Create a memory service with in-memory store (for testing)
 */
export function createInMemoryService(): MemoryService {
  return new MemoryService(new InMemoryStore())
}
