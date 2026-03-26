/**
 * Route handlers module - exports all route handling functionality.
 *
 * This module provides transport-agnostic route handling that can be used
 * by both serverless (Lambda) and dedicated (HTTP) servers.
 */

// Types
export type {
  UnifiedRequest,
  UnifiedResponse,
  RouteContext,
  CallToolFn,
  ParsedJsonRpcBody,
  SkedyulToolCallArgs,
  ParseResult,
} from './types'

// Adapters
export {
  fromLambdaEvent,
  toLambdaResponse,
  parseJsonBody,
  parseJsonRpcBody,
  getHeader,
  getContentType,
  parseBodyByContentType,
} from './adapters'

// Individual handlers (for cases where direct access is needed)
export {
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

// Main router
export { routeRequest } from './router'
