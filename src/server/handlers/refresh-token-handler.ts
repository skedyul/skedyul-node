/**
 * Refresh-token handler - shared implementation for serverless and dedicated servers.
 *
 * The hook exchanges a stored refresh token for a new access token and returns
 * install env to persist. It does not write the database.
 */

import type {
  InvocationContext,
  RefreshTokenHandler,
  RefreshTokenContext,
  ServerHooks,
} from '../../types'
import type { HandlerResult } from './types'
import { runWithConfig } from '../../core/client'
import { AppAuthInvalidError } from '../../errors'
import { runWithLogContext } from '../context-logger'
import { createContextLogger } from '../logger'
import { withRequestEnv } from '../handler-helpers'

export interface RefreshTokenRequestBody {
  env?: Record<string, string>
  invocation?: InvocationContext
}

export async function handleRefreshToken(
  parsedBody: unknown,
  hooks: ServerHooks | undefined,
): Promise<HandlerResult> {
  if (!hooks?.refresh_token) {
    return {
      status: 404,
      body: { error: 'Refresh token handler not configured' },
    }
  }

  const body = (parsedBody ?? {}) as RefreshTokenRequestBody

  if (
    !body.env ||
    typeof body.env !== 'object' ||
    Array.isArray(body.env)
  ) {
    return {
      status: 400,
      body: {
        error: {
          code: -32602,
          message: 'Missing envelope format: expected { env }',
        },
      },
    }
  }

  const refreshContext: RefreshTokenContext = {
    env: body.env,
    invocation: body.invocation,
    log: createContextLogger(),
  }

  const requestConfig = {
    baseUrl: body.env.SKEDYUL_API_URL ?? process.env.SKEDYUL_API_URL ?? '',
    apiToken: body.env.SKEDYUL_API_TOKEN ?? process.env.SKEDYUL_API_TOKEN ?? '',
  }

  try {
    const refreshHook = hooks.refresh_token
    const refreshHandler: RefreshTokenHandler =
      typeof refreshHook === 'function' ? refreshHook : refreshHook.handler

    const result = await withRequestEnv(body.env, async () => {
      return await runWithConfig(requestConfig, async () => {
        return await runWithLogContext({ invocation: body.invocation }, async () => {
          return await refreshHandler(refreshContext)
        })
      })
    })

    return {
      status: 200,
      body: {
        env: result.env ?? {},
      },
    }
  } catch (err) {
    if (err instanceof AppAuthInvalidError) {
      return {
        status: 401,
        body: {
          error: {
            code: err.code,
            message: err.message,
          },
        },
      }
    }

    const errorMessage = err instanceof Error ? err.message : String(err ?? 'Unknown error')
    return {
      status: 500,
      body: {
        error: {
          code: -32603,
          message: errorMessage,
        },
      },
    }
  }
}
