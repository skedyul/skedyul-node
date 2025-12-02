import type { CoreApiConfig } from './core/types'
import type { z } from 'zod'

export interface ToolContext {
  env: Record<string, string | undefined>
  mode?: 'execute' | 'estimate'
}

export interface ToolParams<Input, Output> {
  input: Input
  context: ToolContext
}

export interface BillingInfo {
  credits: number
}

export interface ToolExecutionResult<Output = unknown> {
  output: Output
  billing: BillingInfo
}

export interface ToolSchemaWithJson<
  Schema extends z.ZodTypeAny = z.ZodTypeAny,
> {
  zod: Schema
  jsonSchema?: Record<string, unknown>
}

export type ToolSchema<Schema extends z.ZodTypeAny = z.ZodTypeAny> =
  | Schema
  | ToolSchemaWithJson<Schema>

export type ToolHandler<Input, Output> = (
  params: ToolParams<Input, Output>,
) => Promise<ToolExecutionResult<Output>> | ToolExecutionResult<Output>

export interface ToolDefinition<
  Input = unknown,
  Output = unknown,
  InputSchema extends z.ZodTypeAny = z.ZodType<Input>,
  OutputSchema extends z.ZodTypeAny = z.ZodType<Output>,
> {
  name: string
  description: string
  inputs: ToolSchema<InputSchema>
  handler: ToolHandler<Input, Output>
  outputSchema?: ToolSchema<OutputSchema>
  [key: string]: unknown // Allow additional properties
}

export interface ToolRegistryEntry {
  name: string
  description: string
  inputs: ToolSchema
  handler: unknown
  outputSchema?: ToolSchema
  [key: string]: unknown
}

export type ToolRegistry = Record<string, ToolRegistryEntry>

export type ToolName<T extends ToolRegistry> = Extract<keyof T, string>

export interface ToolMetadata {
  name: string
  description: string
  /**
   * JSON Schema describing the tool's inputs, as returned by zod-to-json-schema.
   * This is intentionally loose to support arbitrary JSON Schema shapes.
   */
  inputSchema?: Record<string, unknown>
  /**
   * Optional JSON Schema describing the tool's output, if provided.
   */
  outputSchema?: Record<string, unknown>
}

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
}

export interface APIGatewayProxyEvent {
  body: string | null
  headers: Record<string, string>
  httpMethod: string
  path: string
  queryStringParameters: Record<string, string> | null
  requestContext: {
    requestId: string
  }
}

export interface APIGatewayProxyResult {
  statusCode: number
  headers?: Record<string, string>
  body: string
}

export interface ToolCallResponse {
  content: { type: 'text'; text: string }[]
  billing?: BillingInfo
  isError?: boolean
}

export interface DedicatedServerInstance {
  listen(port?: number): Promise<void>
  getHealthStatus(): HealthStatus
}

export interface ServerlessServerInstance {
  handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult>
  getHealthStatus(): HealthStatus
}

export type SkedyulServerInstance =
  | DedicatedServerInstance
  | ServerlessServerInstance

