import type { HandlerRawRequest, WebhookRequest } from '../types'

/**
 * Parses a handler envelope from the request body.
 * Detects envelope format: { env: {...}, request: {...}, context?: {...} }
 * Returns the extracted env and request, or null if not an envelope.
 */
export function parseHandlerEnvelope(
  parsedBody: unknown,
): { env: Record<string, string>; request: HandlerRawRequest; context?: unknown } | null {
  // Check if parsedBody is an object with env and request properties
  if (
    typeof parsedBody !== 'object' ||
    parsedBody === null ||
    Array.isArray(parsedBody) ||
    !('env' in parsedBody) ||
    !('request' in parsedBody)
  ) {
    return null
  }

  const envelope = parsedBody as {
    env?: unknown
    request?: unknown
    context?: unknown
  }

  // Validate env is an object (not null, not array)
  if (
    typeof envelope.env !== 'object' ||
    envelope.env === null ||
    Array.isArray(envelope.env)
  ) {
    return null
  }

  // Validate request is an object (structure validation happens in buildRequestFromRaw)
  if (
    typeof envelope.request !== 'object' ||
    envelope.request === null ||
    Array.isArray(envelope.request)
  ) {
    return null
  }

  return {
    env: envelope.env as Record<string, string>,
    request: envelope.request as HandlerRawRequest,
    context: envelope.context,
  }
}

/**
 * Converts a raw HandlerRawRequest (wire format) to a rich WebhookRequest.
 * Parses JSON body if content-type is application/json, creates Buffer rawBody.
 */
export function buildRequestFromRaw(raw: HandlerRawRequest): WebhookRequest {
  // Parse the original request body
  let parsedBody: unknown = raw.body
  const contentType = raw.headers['content-type'] ?? ''
  if (contentType.includes('application/json')) {
    try {
      parsedBody = raw.body ? JSON.parse(raw.body) : {}
    } catch {
      // Keep as string if JSON parsing fails
      parsedBody = raw.body
    }
  }

  return {
    method: raw.method,
    url: raw.url,
    path: raw.path,
    headers: raw.headers as Record<string, string | string[] | undefined>,
    query: raw.query,
    body: parsedBody,
    rawBody: raw.body ? Buffer.from(raw.body, 'utf-8') : undefined,
  }
}

/**
 * Builds request-scoped config by merging env from envelope with process.env fallbacks.
 * Used for SKEDYUL_API_TOKEN and SKEDYUL_API_URL overrides.
 */
export function buildRequestScopedConfig(env: Record<string, string>): {
  baseUrl: string
  apiToken: string
} {
  return {
    baseUrl: env.SKEDYUL_API_URL ?? process.env.SKEDYUL_API_URL ?? '',
    apiToken: env.SKEDYUL_API_TOKEN ?? process.env.SKEDYUL_API_TOKEN ?? '',
  }
}
