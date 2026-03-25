/**
 * Uninstall handler - shared implementation for serverless and dedicated servers.
 */

import type {
  UninstallHandler,
  UninstallHandlerContext,
  ServerHooks,
} from '../../types'
import type { HandlerResult, UninstallRequestBody } from './types'
import { runWithConfig } from '../../core/client'
import { runWithLogContext } from '../context-logger'
import { createContextLogger } from '../logger'

/**
 * Handle uninstall request.
 */
export async function handleUninstall(
  body: UninstallRequestBody,
  hooks: ServerHooks | undefined,
): Promise<HandlerResult> {
  if (!hooks?.uninstall) {
    return {
      status: 404,
      body: { error: 'Uninstall handler not configured' },
    }
  }

  if (
    !body.context?.appInstallationId ||
    !body.context?.workplace ||
    !body.context?.app
  ) {
    return {
      status: 400,
      body: {
        error: {
          code: -32602,
          message: 'Missing context (appInstallationId, workplace and app required)',
        },
      },
    }
  }

  const uninstallContext: UninstallHandlerContext = {
    env: body.env ?? {},
    workplace: body.context.workplace,
    appInstallationId: body.context.appInstallationId,
    app: body.context.app,
    invocation: body.invocation,
    log: createContextLogger(),
  }

  const requestConfig = {
    baseUrl: body.env?.SKEDYUL_API_URL ?? process.env.SKEDYUL_API_URL ?? '',
    apiToken: body.env?.SKEDYUL_API_TOKEN ?? process.env.SKEDYUL_API_TOKEN ?? '',
  }

  try {
    const uninstallHook = hooks.uninstall
    const uninstallHandlerFn: UninstallHandler =
      typeof uninstallHook === 'function' ? uninstallHook : uninstallHook.handler

    const result = await runWithLogContext({ invocation: body.invocation }, async () => {
      return await runWithConfig(requestConfig, async () => {
        return await uninstallHandlerFn(uninstallContext)
      })
    })

    return {
      status: 200,
      body: { cleanedWebhookIds: result.cleanedWebhookIds ?? [] },
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
