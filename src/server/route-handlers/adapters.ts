/**
 * Request/Response adapters for converting between transport-specific formats
 * and the unified format used by route handlers.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from '../../types'
import type { UnifiedRequest, UnifiedResponse, ParseResult } from './types'

/**
 * Convert a Lambda API Gateway event to a UnifiedRequest.
 */
export function fromLambdaEvent(event: APIGatewayProxyEvent): UnifiedRequest {
  // Lambda Function URLs use rawPath instead of path
  // API Gateway uses path
  const path =
    event.path || (event as unknown as { rawPath?: string }).rawPath || '/'
  const method =
    event.httpMethod ||
    (
      event as unknown as {
        requestContext?: { http?: { method?: string } }
      }
    ).requestContext?.http?.method ||
    'POST'

  // Build URL for the request
  const forwardedProto =
    event.headers?.['x-forwarded-proto'] ?? event.headers?.['X-Forwarded-Proto']
  const protocol = forwardedProto ?? 'https'
  const host = event.headers?.host ?? event.headers?.Host ?? 'localhost'
  const queryString = event.queryStringParameters
    ? '?' +
      new URLSearchParams(
        event.queryStringParameters as Record<string, string>,
      ).toString()
    : ''
  const url = `${protocol}://${host}${path}${queryString}`

  return {
    path,
    method,
    headers: event.headers as Record<string, string | string[] | undefined>,
    query: (event.queryStringParameters ?? {}) as Record<string, string>,
    body: event.body,
    url,
  }
}

/**
 * Convert a UnifiedResponse to a Lambda API Gateway result.
 */
export function toLambdaResponse(
  response: UnifiedResponse,
  defaultHeaders: Record<string, string>,
): APIGatewayProxyResult {
  return {
    statusCode: response.status,
    headers: {
      ...defaultHeaders,
      ...response.headers,
    },
    body:
      response.body !== undefined
        ? typeof response.body === 'string'
          ? response.body
          : JSON.stringify(response.body)
        : '',
  }
}

/**
 * Parse JSON body from a UnifiedRequest.
 * Returns a ParseResult with either the parsed data or an error response.
 */
export function parseJsonBody<T = unknown>(
  req: UnifiedRequest,
  errorCode = -32700,
  errorMessage = 'Parse error',
): ParseResult<T> {
  try {
    const data = req.body ? JSON.parse(req.body) : {}
    return { success: true, data: data as T }
  } catch {
    return {
      success: false,
      error: {
        status: 400,
        body: {
          error: {
            code: errorCode,
            message: errorMessage,
          },
        },
      },
    }
  }
}

/**
 * Parse JSON body for JSON-RPC style requests.
 * Returns a ParseResult with either the parsed data or a JSON-RPC error response.
 */
export function parseJsonRpcBody<T = unknown>(req: UnifiedRequest): ParseResult<T> {
  try {
    const data = req.body ? JSON.parse(req.body) : {}
    return { success: true, data: data as T }
  } catch {
    return {
      success: false,
      error: {
        status: 400,
        body: {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error',
          },
        },
      },
    }
  }
}

/**
 * Get a header value from the request, checking both lowercase and capitalized versions.
 */
export function getHeader(
  req: UnifiedRequest,
  name: string,
): string | undefined {
  const value = req.headers[name.toLowerCase()] ?? req.headers[name]
  if (Array.isArray(value)) {
    return value[0]
  }
  return value
}

/**
 * Get content type from request headers.
 */
export function getContentType(req: UnifiedRequest): string {
  return getHeader(req, 'content-type') ?? ''
}

/**
 * Parse body based on content type.
 * Returns parsed JSON for application/json, raw string otherwise.
 */
export function parseBodyByContentType(req: UnifiedRequest): unknown {
  const contentType = getContentType(req)
  const rawBody = req.body ?? ''

  if (contentType.includes('application/json')) {
    try {
      return rawBody ? JSON.parse(rawBody) : {}
    } catch {
      return rawBody
    }
  }

  return rawBody
}
