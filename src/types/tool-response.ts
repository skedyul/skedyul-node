import type {
  ToolSuccess,
  ToolFailure,
  ToolResult,
  ErrorCode,
  ErrorCategory,
  ToolWarning,
  ToolPagination,
  ToolBilling,
  ToolEffect,
  ToolRetry,
} from './tool'

// ─────────────────────────────────────────────────────────────────────────────
// Success Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a successful tool result.
 *
 * @example
 * ```ts
 * import { createSuccessResponse } from 'skedyul'
 *
 * return createSuccessResponse({ order: orderData })
 * ```
 */
export function createSuccessResponse<T>(
  output: T,
  options?: {
    warnings?: ToolWarning[]
    pagination?: ToolPagination
    billing?: ToolBilling
    effect?: ToolEffect
  },
): ToolSuccess<T> {
  return {
    success: true,
    output,
    ...options,
  }
}

/**
 * Create a successful list response with pagination.
 *
 * @example
 * ```ts
 * import { createListResponse } from 'skedyul'
 *
 * return createListResponse(items, { hasMore: true, total: 100 })
 * ```
 */
export function createListResponse<T>(
  items: T[],
  pagination: ToolPagination,
  options?: {
    warnings?: ToolWarning[]
    billing?: ToolBilling
  },
): ToolSuccess<T[]> {
  return {
    success: true,
    output: items,
    pagination,
    ...options,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Infer error category from error code.
 */
function inferCategory(code: ErrorCode): ErrorCategory {
  switch (code) {
    case 'VALIDATION_ERROR':
    case 'CONFLICT':
      return 'validation'
    case 'AUTH_INVALID':
    case 'AUTH_EXPIRED':
    case 'PERMISSION_DENIED':
      return 'auth'
    case 'TIMEOUT':
      return 'timeout'
    case 'RATE_LIMITED':
    case 'EXTERNAL_SERVICE_ERROR':
    case 'NOT_FOUND':
    case 'QUOTA_EXCEEDED':
      return 'external'
    default:
      return 'internal'
  }
}

/**
 * Create a failed tool result with full control over error details.
 *
 * @example
 * ```ts
 * import { createErrorResponse } from 'skedyul'
 *
 * return createErrorResponse('NOT_FOUND', 'Order not found')
 * ```
 */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  options?: {
    category?: ErrorCategory
    field?: string
    details?: Record<string, unknown>
    retry?: ToolRetry
    partialOutput?: unknown
    billing?: ToolBilling
    effect?: ToolEffect
  },
): ToolFailure {
  const category = options?.category ?? inferCategory(code)

  return {
    success: false,
    error: {
      code,
      message,
      category,
      field: options?.field,
      details: options?.details,
    },
    retry: options?.retry,
    partialOutput: options?.partialOutput,
    billing: options?.billing,
    effect: options?.effect,
  }
}

/**
 * Create a validation error result.
 *
 * @example
 * ```ts
 * import { createValidationError } from 'skedyul'
 *
 * return createValidationError('Email is required', 'email')
 * ```
 */
export function createValidationError(
  message: string,
  field?: string,
  details?: Record<string, unknown>,
): ToolFailure {
  return createErrorResponse('VALIDATION_ERROR', message, {
    category: 'validation',
    field,
    details,
  })
}

/**
 * Create a not found error result.
 *
 * @example
 * ```ts
 * import { createNotFoundError } from 'skedyul'
 *
 * return createNotFoundError('Order', orderId)
 * // Error message: "Order 'abc123' not found"
 * ```
 */
export function createNotFoundError(
  resource: string,
  identifier?: string,
): ToolFailure {
  const message = identifier
    ? `${resource} '${identifier}' not found`
    : `${resource} not found`
  return createErrorResponse('NOT_FOUND', message, { category: 'external' })
}

/**
 * Create an authentication error result.
 *
 * @example
 * ```ts
 * import { createAuthError } from 'skedyul'
 *
 * return createAuthError('Invalid API key')
 * return createAuthError('Token expired', { expired: true })
 * ```
 */
export function createAuthError(
  message: string,
  options?: { expired?: boolean; retry?: ToolRetry },
): ToolFailure {
  return createErrorResponse(
    options?.expired ? 'AUTH_EXPIRED' : 'AUTH_INVALID',
    message,
    { category: 'auth', retry: options?.retry },
  )
}

/**
 * Create a rate limit error result.
 *
 * @example
 * ```ts
 * import { createRateLimitError } from 'skedyul'
 *
 * return createRateLimitError(60000) // Retry after 60 seconds
 * ```
 */
export function createRateLimitError(retryAfterMs?: number): ToolFailure {
  return createErrorResponse(
    'RATE_LIMITED',
    'Rate limit exceeded. Please try again later.',
    {
      category: 'external',
      retry: {
        allowed: true,
        afterMs: retryAfterMs,
      },
    },
  )
}

/**
 * Create an external service error result.
 *
 * @example
 * ```ts
 * import { createExternalError } from 'skedyul'
 *
 * return createExternalError('Petbooqz API', 'Connection timeout')
 * ```
 */
export function createExternalError(
  service: string,
  message: string,
  options?: { retry?: ToolRetry; details?: Record<string, unknown> },
): ToolFailure {
  return createErrorResponse(
    'EXTERNAL_SERVICE_ERROR',
    `${service}: ${message}`,
    {
      category: 'external',
      retry: options?.retry ?? { allowed: true },
      details: options?.details,
    },
  )
}

/**
 * Create a timeout error result.
 *
 * @example
 * ```ts
 * import { createTimeoutError } from 'skedyul'
 *
 * return createTimeoutError('Request timed out after 30 seconds')
 * ```
 */
export function createTimeoutError(
  message: string = 'Operation timed out',
  options?: { retry?: ToolRetry },
): ToolFailure {
  return createErrorResponse('TIMEOUT', message, {
    category: 'timeout',
    retry: options?.retry ?? { allowed: true },
  })
}

/**
 * Create a permission denied error result.
 *
 * @example
 * ```ts
 * import { createPermissionError } from 'skedyul'
 *
 * return createPermissionError('You do not have access to this resource')
 * ```
 */
export function createPermissionError(
  message: string = 'Permission denied',
): ToolFailure {
  return createErrorResponse('PERMISSION_DENIED', message, {
    category: 'auth',
  })
}

/**
 * Create a conflict error result (e.g., duplicate resource).
 *
 * @example
 * ```ts
 * import { createConflictError } from 'skedyul'
 *
 * return createConflictError('A client with this email already exists')
 * ```
 */
export function createConflictError(
  message: string,
  field?: string,
): ToolFailure {
  return createErrorResponse('CONFLICT', message, {
    category: 'validation',
    field,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Guards & Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type guard to check if a result is successful.
 *
 * @example
 * ```ts
 * if (isSuccess(result)) {
 *   console.log(result.output) // TypeScript knows output exists
 * }
 * ```
 */
export function isSuccess<T>(result: ToolResult<T>): result is ToolSuccess<T> {
  return result.success === true
}

/**
 * Type guard to check if a result is a failure.
 *
 * @example
 * ```ts
 * if (isFailure(result)) {
 *   console.log(result.error.code) // TypeScript knows error exists
 * }
 * ```
 */
export function isFailure(result: ToolResult<unknown>): result is ToolFailure {
  return result.success === false
}

/**
 * Check if an error is retryable based on its category and retry hints.
 *
 * @example
 * ```ts
 * if (isFailure(result) && isRetryable(result)) {
 *   // Schedule retry
 * }
 * ```
 */
export function isRetryable(result: ToolFailure): boolean {
  if (result.retry?.allowed === false) return false
  if (result.retry?.allowed === true) return true

  // Default retry behavior based on category
  const retryableCategories: ErrorCategory[] = [
    'network',
    'timeout',
    'external',
  ]
  return result.error.category
    ? retryableCategories.includes(result.error.category)
    : false
}

/**
 * Get the suggested retry delay in milliseconds.
 * Returns undefined if no retry hint is available.
 */
export function getRetryDelay(result: ToolFailure): number | undefined {
  return result.retry?.afterMs
}
