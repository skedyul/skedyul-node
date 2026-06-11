import type { ToolCallResponse } from '../../types'

/**
 * MCP content items require `text` to be a string. JSON.stringify(undefined)
 * returns undefined (not a string), which fails MCP SDK validation.
 */
export function serializeMcpContentText(value: unknown): string {
  return JSON.stringify(value ?? null)
}

export function isToolCallFailure(result: ToolCallResponse): boolean {
  const isNewShapeFailure = 'success' in result && result.success === false
  const isLegacyErrorFailure = 'error' in result && result.error != null
  const isLegacyMetaFailure =
    'meta' in result &&
    result.meta != null &&
    typeof result.meta === 'object' &&
    'success' in result.meta &&
    result.meta.success === false

  return isNewShapeFailure || isLegacyErrorFailure || isLegacyMetaFailure
}

export function buildToolCallErrorOutput(
  result: ToolCallResponse,
): { error: unknown; retry?: unknown } {
  const isNewShapeFailure = 'success' in result && result.success === false
  const isLegacyErrorFailure = 'error' in result && result.error != null
  const isLegacyMetaFailure =
    'meta' in result &&
    result.meta != null &&
    typeof result.meta === 'object' &&
    'success' in result.meta &&
    result.meta.success === false

  if (isNewShapeFailure && 'error' in result) {
    return {
      error: result.error,
      retry: 'retry' in result ? result.retry : undefined,
    }
  }

  if (isLegacyErrorFailure && 'error' in result) {
    return { error: result.error }
  }

  if (isLegacyMetaFailure && 'meta' in result && result.meta) {
    const meta = result.meta as { message?: string }
    return {
      error: {
        code: 'TOOL_FAILED',
        message: meta.message ?? 'Tool execution failed',
        category: 'internal',
      },
    }
  }

  return {
    error: {
      code: 'TOOL_FAILED',
      message: 'Tool execution failed',
      category: 'internal',
    },
  }
}
