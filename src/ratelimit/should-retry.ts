const DEFAULT_RETRY_STATUS_CODES = new Set([429, 502, 503, 504])

function getErrorStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }
  const record = error as Record<string, unknown>
  if (typeof record.statusCode === 'number') {
    return record.statusCode
  }
  if (typeof record.status === 'number') {
    return record.status
  }
  return undefined
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }
  const record = error as Record<string, unknown>
  return typeof record.code === 'string' ? record.code : undefined
}

/**
 * Default retry predicate for queuedFetch — rate limits and transient 5xx.
 */
export function defaultShouldRetry(error: unknown, _attempt: number): boolean {
  const code = getErrorCode(error)
  if (code === 'RATE_LIMITED' || code === 'RATE_LIMIT_BACKEND_ERROR') {
    return true
  }

  const status = getErrorStatusCode(error)
  if (status !== undefined && DEFAULT_RETRY_STATUS_CODES.has(status)) {
    return true
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''

  const lower = message.toLowerCase()
  if (
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout')
  ) {
    return true
  }

  return false
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
