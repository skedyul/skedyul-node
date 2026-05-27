/**
 * SSE (Server-Sent Events) stream consumer for Node.js CLI.
 * Parses SSE events from a fetch response stream.
 */

export interface SSEEvent {
  data: string
  event?: string
  id?: string
}

/**
 * Parse SSE events from a ReadableStream.
 * Yields parsed JSON data from each SSE event.
 */
export async function* parseSSEStream<T>(
  response: Response,
  debug = false,
): AsyncGenerator<T> {
  if (!response.body) {
    throw new Error('Response body is null')
  }

  const log = (...args: unknown[]) => {
    if (debug) {
      console.log('\x1b[2m  [SSE]', ...args, '\x1b[0m')
    }
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let chunkCount = 0

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        log('Stream done, total chunks:', chunkCount)
        break
      }

      chunkCount++
      const chunk = decoder.decode(value, { stream: true })
      buffer += chunk

      if (chunkCount <= 3) {
        log('Chunk', chunkCount, ':', chunk.slice(0, 100))
      }

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data.trim()) {
            try {
              const parsed = JSON.parse(data) as T
              log('Event:', JSON.stringify(parsed).slice(0, 80))
              yield parsed
            } catch {
              log('Malformed JSON:', data.slice(0, 50))
            }
          }
        }
      }
    }

    if (buffer.startsWith('data: ')) {
      const data = buffer.slice(6)
      if (data.trim()) {
        try {
          const parsed = JSON.parse(data) as T
          log('Final event:', JSON.stringify(parsed).slice(0, 80))
          yield parsed
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Fetch an SSE endpoint and yield parsed events.
 */
export async function* fetchSSE<T>(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: string
  } = {},
): AsyncGenerator<T> {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'text/event-stream',
      ...options.headers,
    },
    body: options.body,
  })

  if (!response.ok) {
    const text = await response.text()
    let message = `SSE request failed: ${response.status}`
    try {
      const json = JSON.parse(text)
      if (json.error) message = json.error
    } catch {
      if (text) message = text
    }
    throw new Error(message)
  }

  yield* parseSSEStream<T>(response)
}

/**
 * Chat event types from the CLI chat endpoint.
 */
export interface ChatEvent {
  threadId?: string
  threadTitle?: string
  message?: string
  thought?: string
  thoughtComplete?: boolean
  durationMs?: number
  thoughts?: Array<{ content: string; durationMs: number }>
  data?: Array<{ type: string; [key: string]: unknown }>
  context?: Array<{
    model?: string
    hint?: string
    id: string
    label: string
    data?: Record<string, unknown>
  }>
  toolCall?: {
    name: string
    status: 'started' | 'completed' | 'failed'
    args?: Record<string, unknown>
    durationMs?: number
    resultSummary?: string
    autoApproved?: boolean
  }
  /** Pending approval request for a tool that requires user confirmation */
  pendingApproval?: {
    toolCallId: string
    toolName: string
    displayName: string
    args: Record<string, unknown>
  }
  /** Name of the agent currently responding (for multi-stage agent runs) */
  agentName?: string
  /** Whether this event is from a child agent invocation (for visual hierarchy in CLI) */
  isChildAgent?: boolean
  /** Full output from an agent stage (for debugging multi-stage pipelines) */
  agentOutput?: string
  done?: boolean
  initial?: boolean
  error?: string
  sandbox?: boolean
  /** Updated mock context after tool execution (sandbox mode only) */
  updatedMockContext?: {
    sender: {
      displayName?: string
      kind: 'contact' | 'member'
      role?: string
      permissions?: string[]
      crm?: {
        model: string
        data: Record<string, unknown>
      }
    }
    contexts?: Array<{
      handle: string
      model: string
      data: Record<string, unknown>
    }>
  }
  /** Tool calls from this turn with their results (for accumulating tool history) */
  toolCalls?: Array<{
    toolCallId: string
    toolName: string
    args: Record<string, unknown>
    result: unknown
    /** Provider-specific options (e.g., Gemini's thought_signature for tool call replay) */
    providerOptions?: Record<string, unknown>
    /** AI SDK tool handle (e.g., "load_skill" for "system:skill:load") - needed for correct message replay */
    handle?: string
  }>
  /** Sent message event (explicit message mode) */
  sentMessage?: {
    messageId: string
    content: string
    type: 'intermediate' | 'final' | 'scheduled'
    scheduledFor?: string
  }
  /** All messages sent during this turn (for explicit message mode) */
  sentMessages?: Array<{
    id: string
    rawContent: string
    transformedContent: string
    type: 'intermediate' | 'final' | 'scheduled'
    scheduledFor?: string
    timestamp?: string
    index?: number
  }>
}
