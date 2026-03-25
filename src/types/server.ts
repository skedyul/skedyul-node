import type { APIGatewayProxyEvent, APIGatewayProxyResult } from './aws'
import type { ComputeLayer } from '../config/types/base'

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

export type { ComputeLayer }

export interface DedicatedServerInstance {
  listen(port?: number): Promise<void>
  getHealthStatus(): HealthStatus
}

export interface ServerlessServerInstance {
  handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult>
  getHealthStatus(): HealthStatus
}

export type SkedyulServerInstance = DedicatedServerInstance | ServerlessServerInstance
