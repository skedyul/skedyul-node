/**
 * Webhook renew handler - shared implementation for serverless and dedicated servers.
 *
 * The platform calls POST /webhook_renew shortly before a registration created
 * with `autoRenew: true` expires. The app renews the provider subscription that
 * points at the registration and returns the new expiry; the platform stores it.
 */

import type {
  InvocationContext,
  WebhookRegistry,
  WebhookRenewContext,
  WebhookRenewRegistration,
} from '../../types'
import type { AppInfo, WorkplaceInfo } from '../../types/shared'
import type { HandlerResult } from './types'
import { runWithConfig } from '../../core/client'
import { AppAuthInvalidError, TokenRefreshRequiredError } from '../../errors'
import { runWithLogContext } from '../context-logger'
import { createContextLogger } from '../logger'
import { withRequestEnv } from '../handler-helpers'

export interface WebhookRenewRequestBody {
  env?: Record<string, string>
  registration?: WebhookRenewRegistration
  context?: {
    app?: AppInfo
    appInstallationId?: string
    workplace?: WorkplaceInfo
  }
  invocation?: InvocationContext
}

const invalid = (message: string): HandlerResult => ({
  status: 400,
  body: { error: { code: -32602, message } },
})

export async function handleWebhookRenew(
  parsedBody: unknown,
  webhookRegistry: WebhookRegistry | undefined,
): Promise<HandlerResult> {
  const body = (parsedBody ?? {}) as WebhookRenewRequestBody

  if (!body.env || typeof body.env !== 'object' || Array.isArray(body.env)) {
    return invalid('Missing envelope format: expected { env, registration, context }')
  }
  const registration = body.registration
  if (!registration || typeof registration.name !== 'string' || typeof registration.id !== 'string') {
    return invalid('Missing registration: expected { id, name, url, context, expiresAt }')
  }

  const renew = webhookRegistry?.[registration.name]?.renew
  if (!renew) {
    return {
      status: 404,
      body: { error: `Webhook renew handler not configured for '${registration.name}'` },
    }
  }

  const renewContext: WebhookRenewContext = {
    registration: {
      id: registration.id,
      name: registration.name,
      url: registration.url,
      context: registration.context ?? null,
      expiresAt: registration.expiresAt ?? null,
    },
    env: body.env,
    app: body.context?.app as AppInfo,
    appInstallationId: body.context?.appInstallationId ?? '',
    workplace: body.context?.workplace as WorkplaceInfo,
    invocation: body.invocation,
    log: createContextLogger(),
  }

  const requestConfig = {
    baseUrl: body.env.SKEDYUL_API_URL ?? process.env.SKEDYUL_API_URL ?? '',
    apiToken: body.env.SKEDYUL_API_TOKEN ?? process.env.SKEDYUL_API_TOKEN ?? '',
  }

  try {
    const result = await withRequestEnv(body.env, async () => {
      return await runWithConfig(requestConfig, async () => {
        return await runWithLogContext({ invocation: body.invocation }, async () => {
          return await renew(renewContext)
        })
      })
    })

    if (result && 'delete' in result && result.delete === true) {
      return { status: 200, body: { delete: true } }
    }
    const renewed = result as { expiresAt?: string | null; context?: Record<string, unknown> }
    if (!renewed || !('expiresAt' in renewed)) {
      return {
        status: 500,
        body: {
          error: { code: -32603, message: 'Renew handler must return { expiresAt } or { delete: true }' },
        },
      }
    }
    return {
      status: 200,
      body: {
        expiresAt: renewed.expiresAt ?? null,
        ...(renewed.context ? { context: renewed.context } : {}),
      },
    }
  } catch (err) {
    // Same shape as webhook and tool results, so the platform can refresh the
    // token (and retry) or mark the installation's auth invalid.
    if (err instanceof TokenRefreshRequiredError) {
      return {
        status: 200,
        body: {
          success: false,
          error: {
            code: err.code,
            message: err.message,
            category: 'auth',
            ...(err.tokenKey ? { details: { tokenKey: err.tokenKey } } : {}),
          },
        },
      }
    }
    if (err instanceof AppAuthInvalidError) {
      return {
        status: 200,
        body: {
          success: false,
          error: { code: err.code, message: err.message, category: 'auth' },
        },
      }
    }

    const message = err instanceof Error ? err.message : String(err ?? 'Unknown error')
    return {
      status: 500,
      body: { error: { code: -32603, message } },
    }
  }
}
