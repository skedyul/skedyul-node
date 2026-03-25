/**
 * Provision handler - shared implementation for serverless and dedicated servers.
 */

import type {
  ProvisionHandler,
  ProvisionHandlerContext,
  ServerHooks,
} from '../../types'
import type { HandlerResult, ProvisionRequestBody } from './types'
import { runWithConfig } from '../../core/client'
import { runWithLogContext } from '../context-logger'
import { createContextLogger } from '../logger'

/**
 * Handle provision request.
 */
export async function handleProvision(
  body: ProvisionRequestBody,
  hooks: ServerHooks | undefined,
): Promise<HandlerResult> {
  if (!hooks?.provision) {
    return {
      status: 404,
      body: { error: 'Provision handler not configured' },
    }
  }

  if (!body.context?.app) {
    return {
      status: 400,
      body: {
        error: {
          code: -32602,
          message: 'Missing context (app required)',
        },
      },
    }
  }

  // SECURITY: Merge process.env (baked-in secrets) with request env (API token).
  // This ensures secrets like MAILGUN_API_KEY come from the container,
  // while runtime values like SKEDYUL_API_TOKEN come from the request.
  const mergedEnv: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      mergedEnv[key] = value
    }
  }
  // Request env overrides process.env (e.g., for SKEDYUL_API_TOKEN)
  Object.assign(mergedEnv, body.env ?? {})

  const provisionContext: ProvisionHandlerContext = {
    env: mergedEnv,
    app: body.context.app,
    invocation: body.invocation,
    log: createContextLogger(),
  }

  const requestConfig = {
    baseUrl: mergedEnv.SKEDYUL_API_URL ?? '',
    apiToken: mergedEnv.SKEDYUL_API_TOKEN ?? '',
  }

  try {
    const provisionHook = hooks.provision
    const provisionHandler: ProvisionHandler =
      typeof provisionHook === 'function'
        ? provisionHook
        : (provisionHook as { handler: ProvisionHandler }).handler

    const result = await runWithLogContext({ invocation: body.invocation }, async () => {
      return await runWithConfig(requestConfig, async () => {
        return await provisionHandler(provisionContext)
      })
    })

    return {
      status: 200,
      body: result,
    }
  } catch (err) {
    return {
      status: 500,
      body: {
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : String(err ?? ''),
        },
      },
    }
  }
}
