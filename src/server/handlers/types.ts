/**
 * Shared types for handler implementations.
 * These types abstract over serverless vs dedicated server differences.
 */

import type { InvocationContext } from '../../types'

/**
 * Generic handler result that can be converted to either serverless or HTTP response.
 */
export interface HandlerResult {
  status: number
  body: unknown
  headers?: Record<string, string>
}

/**
 * Common envelope format from the platform.
 */
export interface HandlerEnvelope {
  env: Record<string, string>
  request: RawRequest
  context?: EnvelopeContext
  invocation?: InvocationContext
}

/**
 * Raw request from envelope.
 */
export interface RawRequest {
  method: string
  url: string
  path: string
  headers: Record<string, string>
  query: Record<string, string>
  body: string
}

/**
 * Context from envelope.
 */
export interface EnvelopeContext {
  app: { id: string; versionId: string }
  appInstallationId?: string | null
  workplace?: { id: string; subdomain: string } | null
  registration?: Record<string, unknown> | null
}

/**
 * Install request body format.
 */
export interface InstallRequestBody {
  env?: Record<string, string>
  invocation?: InvocationContext
  context?: {
    app: { id: string; versionId: string; handle: string; versionHandle: string }
    appInstallationId: string
    workplace: { id: string; subdomain: string }
  }
}

/**
 * Uninstall request body format.
 */
export interface UninstallRequestBody {
  env?: Record<string, string>
  invocation?: InvocationContext
  context?: {
    app: { id: string; versionId: string; handle: string; versionHandle: string }
    appInstallationId: string
    workplace: { id: string; subdomain: string }
  }
}

/**
 * Provision request body format.
 */
export interface ProvisionRequestBody {
  env?: Record<string, string>
  invocation?: InvocationContext
  context?: {
    app: { id: string; versionId: string }
  }
}
