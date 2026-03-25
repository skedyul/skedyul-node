/**
 * Install handler - shared implementation for serverless and dedicated servers.
 */

import type {
  InstallHandler,
  InstallHandlerContext,
  ServerHooks,
} from '../../types'
import type { HandlerResult, InstallRequestBody } from './types'
import { runWithConfig } from '../../core/client'
import { InstallError } from '../../errors'
import { runWithLogContext } from '../context-logger'
import { createContextLogger } from '../logger'

/**
 * Handle install request.
 */
export async function handleInstall(
  body: InstallRequestBody,
  hooks: ServerHooks | undefined,
): Promise<HandlerResult> {
  if (!hooks?.install) {
    return {
      status: 404,
      body: { error: 'Install handler not configured' },
    }
  }

  if (!body.context?.appInstallationId || !body.context?.workplace) {
    return {
      status: 400,
      body: {
        error: {
          code: -32602,
          message: 'Missing context (appInstallationId and workplace required)',
        },
      },
    }
  }

  const installContext: InstallHandlerContext = {
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
    const installHook = hooks.install
    const installHandler: InstallHandler =
      typeof installHook === 'function' ? installHook : installHook.handler
    
    const result = await runWithLogContext({ invocation: body.invocation }, async () => {
      return await runWithConfig(requestConfig, async () => {
        return await installHandler(installContext)
      })
    })

    return {
      status: 200,
      body: { env: result.env ?? {}, redirect: result.redirect },
    }
  } catch (err) {
    if (err instanceof InstallError) {
      return {
        status: 400,
        body: {
          error: {
            code: err.code,
            message: err.message,
            field: err.field,
          },
        },
      }
    }
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
