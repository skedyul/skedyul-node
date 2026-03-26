/**
 * Main router - routes requests to the appropriate handler.
 *
 * This is the central routing logic shared between serverless and dedicated servers.
 */

import type { UnifiedRequest, UnifiedResponse, RouteContext } from './types'
import {
  handleHealthRoute,
  handleConfigRoute,
  handleCoreRoute,
  handleCoreWebhookRoute,
  handleEstimateRoute,
  handleInstallRoute,
  handleUninstallRoute,
  handleProvisionRoute,
  handleOAuthCallbackRoute,
  handleWebhookRoute,
  handleMcpRoute,
  createNotFoundResponse,
  createOptionsResponse,
  createErrorResponse,
} from './handlers'

/**
 * Route a request to the appropriate handler.
 *
 * This function contains all the routing logic that was previously duplicated
 * between serverless.ts and dedicated.ts.
 */
export async function routeRequest(
  req: UnifiedRequest,
  ctx: RouteContext,
): Promise<UnifiedResponse> {
  try {
    if (req.method === 'OPTIONS') {
      return createOptionsResponse()
    }

    // Handle webhook requests: /webhooks/{handle}
    if (req.path.startsWith('/webhooks/') && ctx.webhookRegistry) {
      const handle = req.path.slice('/webhooks/'.length)
      return handleWebhookRoute(req, handle, ctx)
    }

    if (req.path === '/core' && req.method === 'POST') {
      return handleCoreRoute(req, ctx)
    }

    if (req.path === '/core/webhook' && req.method === 'POST') {
      return handleCoreWebhookRoute(req, ctx)
    }

    if (req.path === '/estimate' && req.method === 'POST') {
      return handleEstimateRoute(req, ctx)
    }

    if (req.path === '/install' && req.method === 'POST') {
      return handleInstallRoute(req, ctx)
    }

    if (req.path === '/uninstall' && req.method === 'POST') {
      return handleUninstallRoute(req, ctx)
    }

    if (req.path === '/provision' && req.method === 'POST') {
      return handleProvisionRoute(req, ctx)
    }

    if (req.path === '/oauth_callback' && req.method === 'POST') {
      return handleOAuthCallbackRoute(req, ctx)
    }

    if (req.path === '/health' && req.method === 'GET') {
      return handleHealthRoute(ctx)
    }

    if (req.path === '/config' && req.method === 'GET') {
      return handleConfigRoute(ctx)
    }

    if (req.path === '/mcp' && req.method === 'POST') {
      return handleMcpRoute(req, ctx)
    }

    return createNotFoundResponse()
  } catch (err) {
    return createErrorResponse(err)
  }
}
