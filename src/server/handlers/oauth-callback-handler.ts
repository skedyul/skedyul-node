/**
 * OAuth callback handler - shared implementation for serverless and dedicated servers.
 */

import type {
  OAuthCallbackHandler,
  OAuthCallbackContext,
  InvocationContext,
  ServerHooks,
} from '../../types'
import type { HandlerResult } from './types'
import { runWithConfig } from '../../core/client'
import { runWithLogContext } from '../context-logger'
import { createContextLogger } from '../logger'
import { parseHandlerEnvelope, buildRequestFromRaw, buildRequestScopedConfig } from '../handler-helpers'

/**
 * Handle OAuth callback request.
 */
export async function handleOAuthCallback(
  parsedBody: unknown,
  hooks: ServerHooks | undefined,
): Promise<HandlerResult> {
  if (!hooks?.oauth_callback) {
    return {
      status: 404,
      body: { error: 'OAuth callback handler not configured' },
    }
  }

  // Parse envelope using shared helper
  const envelope = parseHandlerEnvelope(parsedBody)
  if (!envelope) {
    console.error('[OAuth Callback] Failed to parse envelope. Body:', JSON.stringify(parsedBody, null, 2))
    return {
      status: 400,
      body: {
        error: {
          code: -32602,
          message: 'Missing envelope format: expected { env, request }',
        },
      },
    }
  }

  // Extract invocation context from parsed body
  const invocation = (parsedBody as { invocation?: InvocationContext }).invocation

  // Convert raw request to rich request using shared helper
  const oauthRequest = buildRequestFromRaw(envelope.request)

  // Build request-scoped config using shared helper
  const requestConfig = buildRequestScopedConfig(envelope.env)

  const oauthCallbackContext: OAuthCallbackContext = {
    request: oauthRequest,
    invocation,
    log: createContextLogger(),
  }

  try {
    const oauthCallbackHook = hooks.oauth_callback
    const oauthCallbackHandler: OAuthCallbackHandler =
      typeof oauthCallbackHook === 'function'
        ? oauthCallbackHook
        : oauthCallbackHook.handler

    const result = await runWithLogContext({ invocation }, async () => {
      return await runWithConfig(requestConfig, async () => {
        return await oauthCallbackHandler(oauthCallbackContext)
      })
    })

    return {
      status: 200,
      body: {
        appInstallationId: result.appInstallationId,
        env: result.env ?? {},
      },
    }
  } catch (err) {
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
