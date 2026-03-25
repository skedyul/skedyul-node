/**
 * Shared handlers for serverless and dedicated servers.
 * 
 * These handlers contain the core business logic that is identical
 * between serverless (Lambda) and dedicated (HTTP) server modes.
 */

export * from './types'
export { handleInstall } from './install-handler'
export { handleUninstall } from './uninstall-handler'
export { handleProvision } from './provision-handler'
export { handleOAuthCallback } from './oauth-callback-handler'
export {
  parseWebhookRequest,
  executeWebhookHandler,
  isMethodAllowed,
  type ParsedWebhookData,
} from './webhook-handler'
