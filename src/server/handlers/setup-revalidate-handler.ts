/**
 * Setup revalidate handler - shared implementation for serverless and dedicated servers.
 */

import type {
  SetupRevalidateHandler,
  SetupRevalidateContext,
  ServerHooks,
} from '../../types'
import type { HandlerResult, SetupRevalidateRequestBody } from './types'
import { runWithConfig } from '../../core/client'
import { runWithLogContext } from '../context-logger'
import { createContextLogger } from '../logger'

/**
 * Handle setup revalidate request (CRM/env change notification).
 */
export async function handleSetupRevalidate(
  body: SetupRevalidateRequestBody,
  hooks: ServerHooks | undefined,
): Promise<HandlerResult> {
  const revalidateHook = hooks?.setup?.revalidate
  if (!revalidateHook) {
    return {
      status: 404,
      body: { error: 'Setup revalidate handler not configured' },
    }
  }

  if (
    !body.context?.appInstallationId ||
    !body.context?.workplace ||
    !body.context?.app ||
    !body.reason ||
    !Array.isArray(body.steps)
  ) {
    return {
      status: 400,
      body: {
        error: {
          code: -32602,
          message:
            'Missing context (appInstallationId, workplace, app, reason, and steps required)',
        },
      },
    }
  }

  const ctx: SetupRevalidateContext = {
    env: body.env ?? {},
    workplace: body.context.workplace,
    appInstallationId: body.context.appInstallationId,
    app: body.context.app,
    reason: body.reason,
    steps: body.steps,
    crm: body.crm,
    envChange: body.envChange,
    invocation: body.invocation,
    log: createContextLogger(),
  }

  const requestConfig = {
    baseUrl: body.env?.SKEDYUL_API_URL ?? process.env.SKEDYUL_API_URL ?? '',
    apiToken: body.env?.SKEDYUL_API_TOKEN ?? process.env.SKEDYUL_API_TOKEN ?? '',
  }

  try {
    const handler: SetupRevalidateHandler =
      typeof revalidateHook === 'function'
        ? revalidateHook
        : revalidateHook.handler

    const result = await runWithLogContext(
      { invocation: body.invocation },
      async () => {
        return await runWithConfig(requestConfig, async () => {
          return await handler(ctx)
        })
      },
    )

    return {
      status: 200,
      body: {
        completed: result?.completed ?? [],
        invalidated: result?.invalidated ?? [],
      },
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
