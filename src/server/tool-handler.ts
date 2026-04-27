import type {
  HealthStatus,
  ToolCallResponse,
  ToolMetadata,
  ToolName,
  ToolRegistry,
  ToolExecutionContext,
  ToolTrigger,
  InvocationContext,
} from '../types'
import type { RequestState, ToolCallArgs } from './types'
import { getJsonSchemaFromToolSchema, normalizeBilling } from './utils'
import { runWithConfig } from '../core/client'
import { AppAuthInvalidError } from '../errors'
import { runWithLogContext } from './context-logger'
import { createContextLogger } from './logger'

/**
 * Builds tool metadata array from a tool registry
 */
export function buildToolMetadata(registry: ToolRegistry): ToolMetadata[] {
  return Object.values(registry).map((tool) => {
    const toolConfig = tool.config ?? {}
    const timeout = typeof toolConfig.timeout === 'number' && toolConfig.timeout > 0 ? toolConfig.timeout : 10000
    const retries = typeof toolConfig.retries === 'number' && toolConfig.retries >= 1 ? toolConfig.retries : 1
    return {
      name: tool.name,
      displayName: tool.label || tool.name,
      description: tool.description,
      inputSchema: getJsonSchemaFromToolSchema(tool.inputSchema),
      outputSchema: getJsonSchemaFromToolSchema(tool.outputSchema),
      config: {
        timeout,
        retries,
        completionHints: toolConfig.completionHints,
      },
    }
  })
}

/**
 * Creates a request state tracker for managing request counts and health status
 */
export function createRequestState(
  maxRequests: number | null,
  ttlExtendSeconds: number,
  runtimeLabel: string,
  toolNames: string[],
): RequestState {
  let requestCount = 0
  let lastRequestTime = Date.now()

  return {
    incrementRequestCount() {
      requestCount += 1
      lastRequestTime = Date.now()
    },
    shouldShutdown() {
      return maxRequests !== null && requestCount >= maxRequests
    },
    getHealthStatus(): HealthStatus {
      return {
        status: 'running',
        requests: requestCount,
        maxRequests,
        requestsRemaining:
          maxRequests !== null ? Math.max(0, maxRequests - requestCount) : null,
        lastRequestTime,
        ttlExtendSeconds,
        runtime: runtimeLabel,
        tools: [...toolNames],
      }
    },
  }
}

/**
 * Creates a tool call handler function for executing tools from the registry
 */
export function createCallToolHandler<T extends ToolRegistry>(
  registry: T,
  state: RequestState,
  onMaxRequests?: () => void,
) {
  return async function callTool(
    toolNameInput: unknown,
    toolArgsInput: unknown,
  ): Promise<ToolCallResponse> {
    const toolName = String(toolNameInput) as ToolName<T>
    const tool = registry[toolName]

    if (!tool) {
      throw new Error(`Tool "${toolName}" not found in registry`)
    }

    if (!tool.handler || typeof tool.handler !== 'function') {
      throw new Error(`Tool "${toolName}" handler is not a function`)
    }

    const fn = tool.handler

    const args = (toolArgsInput ?? {}) as ToolCallArgs
    const estimateMode = args.estimate === true
    if (!estimateMode) {
      state.incrementRequestCount()
      if (state.shouldShutdown()) {
        onMaxRequests?.()
      }
    }

    const requestEnv = args.env ?? {}
    const originalEnv = { ...process.env }
    Object.assign(process.env, requestEnv)

    // Extract invocation context from args (passed from workflow)
    const invocation = args.invocation as InvocationContext | undefined

    try {
      // Get tool inputs (clean, no context)
      const inputs = (args.inputs ?? {}) as Record<string, unknown>

      // Get context from args.context (separate from inputs)
      const rawContext = (args.context ?? {}) as Record<string, unknown>

      // Extract app info (required for all contexts)
      const app = rawContext.app as { id: string; versionId: string }

      // Determine trigger type from context
      const trigger = (rawContext.trigger as ToolTrigger) || 'agent'

      // Build execution context based on trigger type
      let executionContext: ToolExecutionContext

      // Create context-aware logger
      const log = createContextLogger()

      if (trigger === 'provision') {
        // Provision context - no installation, no workplace
        executionContext = {
          trigger: 'provision',
          app,
          env: process.env as Record<string, string | undefined>,
          mode: estimateMode ? 'estimate' : 'execute',
          invocation,
          log,
        }
      } else {
        // Runtime context - has installation, workplace, request
        const workplace = rawContext.workplace as { id: string; subdomain: string }
        const request = rawContext.request as { url: string; params: Record<string, string>; query: Record<string, string> }
        const appInstallationId = rawContext.appInstallationId as string
        const envVars = process.env as Record<string, string | undefined>
        const modeValue: 'execute' | 'estimate' = estimateMode ? 'estimate' : 'execute'

        if (trigger === 'field_change') {
          const field = rawContext.field as { handle: string; type: string; pageHandle: string; value: unknown; previousValue?: unknown }
          executionContext = { trigger: 'field_change', app, appInstallationId, workplace, request, env: envVars, mode: modeValue, field, invocation, log }
        } else if (trigger === 'page_action') {
          const page = rawContext.page as { handle: string; values: Record<string, unknown> }
          executionContext = { trigger: 'page_action', app, appInstallationId, workplace, request, env: envVars, mode: modeValue, page, invocation, log }
        } else if (trigger === 'form_submit') {
          const form = rawContext.form as { handle: string; values: Record<string, unknown> }
          executionContext = { trigger: 'form_submit', app, appInstallationId, workplace, request, env: envVars, mode: modeValue, form, invocation, log }
        } else if (trigger === 'workflow') {
          executionContext = { trigger: 'workflow', app, appInstallationId, workplace, request, env: envVars, mode: modeValue, invocation, log }
        } else if (trigger === 'page_context') {
          // Page context trigger - similar to agent but for page context resolution
          executionContext = { trigger: 'agent', app, appInstallationId, workplace, request, env: envVars, mode: modeValue, invocation, log }
        } else {
          // Default to agent
          executionContext = { trigger: 'agent', app, appInstallationId, workplace, request, env: envVars, mode: modeValue, invocation, log }
        }
      }

      // Build request-scoped config from env passed in MCP call
      const requestConfig = {
        baseUrl: requestEnv.SKEDYUL_API_URL ?? process.env.SKEDYUL_API_URL ?? '',
        apiToken: requestEnv.SKEDYUL_API_TOKEN ?? process.env.SKEDYUL_API_TOKEN ?? '',
      }

      // Call handler with two arguments: (input, context)
      // Wrap in runWithConfig for request-scoped SDK configuration
      // IMPORTANT: runWithConfig must be the OUTER wrapper to ensure AsyncLocalStorage
      // context is preserved across all async operations including fetch() calls
      const functionResult = await runWithConfig(requestConfig, async () => {
        return await runWithLogContext({ invocation }, async () => {
          return await fn(inputs as never, executionContext as never)
        })
      })

      const billing = normalizeBilling(functionResult.billing)

      return {
        output: functionResult.output,
        billing,
        meta: functionResult.meta ?? {
          success: true,
          message: 'OK',
          toolName,
        },
        effect: functionResult.effect,
      }
    } catch (error) {
      // Check if it's an AppAuthInvalidError
      if (error instanceof AppAuthInvalidError) {
        return {
          output: null,
          billing: { credits: 0 },
          meta: {
            success: false,
            message: error.message,
            toolName,
          },
          error: {
            code: error.code,
            message: error.message,
          },
          // Note: redirect URL will be added by workflow after detecting APP_AUTH_INVALID
        }
      }
      
      // Generic error handling for other errors
      const errorMessage = error instanceof Error ? error.message : String(error ?? '')
      return {
        output: null,
        billing: { credits: 0 },
        meta: {
          success: false,
          message: errorMessage,
          toolName,
        },
        error: {
          code: 'TOOL_EXECUTION_ERROR',
          message: errorMessage,
        },
      }
    } finally {
      process.env = originalEnv
    }
  }
}
