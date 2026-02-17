import type { WebhookRequest } from './webhook'

// ─────────────────────────────────────────────────────────────────────────────
// Install Handler Types
// ─────────────────────────────────────────────────────────────────────────────

export interface InstallHandlerContext {
  env: Record<string, string>
  workplace: { id: string; subdomain: string }
  appInstallationId: string
  app: { id: string; versionId: string; handle: string; versionHandle: string }
}

// Base response types for install handlers
export interface InstallHandlerResponseOAuth {
  env?: Record<string, string>
  redirect: string // Required when oauth_callback hook exists
}

export interface InstallHandlerResponseStandard {
  env?: Record<string, string>
  redirect?: string // Optional when no oauth_callback hook
}

// Helper type to check if oauth_callback exists in ServerHooks
export type HasOAuthCallback<Hooks extends ServerHooks> = Hooks extends {
  oauth_callback: any
}
  ? true
  : false

// Conditional InstallHandlerResult based on whether oauth_callback exists
export type InstallHandlerResult<Hooks extends ServerHooks = ServerHooks> =
  HasOAuthCallback<Hooks> extends true
    ? InstallHandlerResponseOAuth
    : InstallHandlerResponseStandard

// Conditional InstallHandler based on whether oauth_callback exists
export type InstallHandler<Hooks extends ServerHooks = ServerHooks> = (
  ctx: InstallHandlerContext,
) => Promise<InstallHandlerResult<Hooks>>

// ─────────────────────────────────────────────────────────────────────────────
// Uninstall Handler Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UninstallHandlerContext {
  env: Record<string, string>
  workplace: { id: string; subdomain: string }
  appInstallationId: string
  app: { id: string; versionId: string; handle: string; versionHandle: string }
}

export interface UninstallHandlerResult {
  cleanedWebhookIds?: string[]
}

export type UninstallHandler = (
  ctx: UninstallHandlerContext,
) => Promise<UninstallHandlerResult>

// ─────────────────────────────────────────────────────────────────────────────
// OAuth Callback Handler Types
// ─────────────────────────────────────────────────────────────────────────────

export interface OAuthCallbackContext {
  /** Full HTTP request from the OAuth provider */
  request: WebhookRequest  // Reuse the existing rich request type
}

export interface OAuthCallbackResult {
  env?: Record<string, string>       // Env vars to persist (e.g., access_token)
  appInstallationId?: string         // App tells platform which installation to complete
}

export type OAuthCallbackHandler = (
  ctx: OAuthCallbackContext,
) => Promise<OAuthCallbackResult>

// ─────────────────────────────────────────────────────────────────────────────
// Provision Handler Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ProvisionHandlerContext {
  env: Record<string, string>
  app: { id: string; versionId: string }
}

export interface ProvisionHandlerResult {
  // Empty for now, can add fields as needed
}

export type ProvisionHandler = (
  ctx: ProvisionHandlerContext,
) => Promise<ProvisionHandlerResult>

// ─────────────────────────────────────────────────────────────────────────────
// Server Hooks Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base ServerHooks type with common fields
 */
type BaseServerHooks = {
  /** Called after app version provisioning to set up version-level resources */
  provision?:
    | ProvisionHandler
    | {
        handler: ProvisionHandler
        /** Timeout in milliseconds. Defaults to 300000 (5 minutes) if not specified. */
        timeout?: number
      }
  /** Called during app uninstallation to clean up external resources */
  uninstall?:
    | UninstallHandler
    | {
        handler: UninstallHandler
        /** Timeout in milliseconds. Defaults to 60000 (1 minute) if not specified. */
        timeout?: number
      }
}

/**
 * ServerHooks when oauth_callback is present.
 * In this case, install handler MUST return a redirect.
 */
export type ServerHooksWithOAuth = BaseServerHooks & {
  /** Called during app installation to validate/normalize env and perform setup */
  install:
    | InstallHandler<ServerHooksWithOAuth>
    | {
        handler: InstallHandler<ServerHooksWithOAuth>
        /** Timeout in milliseconds. Defaults to 60000 (1 minute) if not specified. */
        timeout?: number
      }
  /** Called when OAuth provider redirects back with authorization code */
  oauth_callback:
    | OAuthCallbackHandler
    | {
        handler: OAuthCallbackHandler
        /** Timeout in milliseconds. Defaults to 60000 (1 minute) if not specified. */
        timeout?: number
      }
}

/**
 * ServerHooks when oauth_callback is not present.
 * In this case, install handler may optionally return a redirect.
 */
export type ServerHooksWithoutOAuth = BaseServerHooks & {
  /** Called during app installation to validate/normalize env and perform setup */
  install?:
    | InstallHandler<ServerHooksWithoutOAuth>
    | {
        handler: InstallHandler<ServerHooksWithoutOAuth>
        /** Timeout in milliseconds. Defaults to 60000 (1 minute) if not specified. */
        timeout?: number
      }
  /** Called when OAuth provider redirects back with authorization code */
  oauth_callback?: never
}

/**
 * Lifecycle hooks for the Skedyul server.
 * These handlers are called during app installation and provisioning.
 * 
 * If oauth_callback is defined, install handler MUST return a redirect.
 */
export type ServerHooks = ServerHooksWithOAuth | ServerHooksWithoutOAuth
