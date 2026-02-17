import type { CoreApiConfig } from '../core/types'
import type { ServerHooks } from './handlers'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from './aws'

// ─────────────────────────────────────────────────────────────────────────────
// Server Types
// ─────────────────────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: 'running'
  requests: number
  maxRequests: number | null
  requestsRemaining: number | null
  lastRequestTime: number
  ttlExtendSeconds: number
  runtime: string
  tools: string[]
}

export type ComputeLayer = 'dedicated' | 'serverless'

export interface ServerMetadata {
  name: string
  version: string
}

export interface CorsOptions {
  allowOrigin?: string
  allowMethods?: string
  allowHeaders?: string
}

export interface SkedyulServerConfig {
  computeLayer: ComputeLayer
  metadata: ServerMetadata
  defaultPort?: number
  maxRequests?: number | null
  ttlExtendSeconds?: number
  cors?: CorsOptions
  coreApi?: CoreApiConfig
  /** Lifecycle hooks for install and provision handlers */
  hooks?: ServerHooks
}

export interface DedicatedServerInstance {
  listen(port?: number): Promise<void>
  getHealthStatus(): HealthStatus
}

export interface ServerlessServerInstance {
  handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult>
  getHealthStatus(): HealthStatus
}

export type SkedyulServerInstance = DedicatedServerInstance | ServerlessServerInstance
