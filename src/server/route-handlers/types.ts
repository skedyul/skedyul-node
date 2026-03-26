/**
 * Unified types for route handlers.
 *
 * These types abstract away the differences between Lambda events and HTTP requests,
 * allowing route handlers to be transport-agnostic.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type {
  ToolCallResponse,
  ToolMetadata,
  ToolRegistry,
  WebhookRegistry,
  InvocationContext,
} from '../../types'
import type { RuntimeSkedyulConfig } from '../index'
import type { RequestState } from '../types'

/**
 * Unified request format that works for both Lambda and HTTP.
 */
export interface UnifiedRequest {
  path: string
  method: string
  headers: Record<string, string | string[] | undefined>
  query: Record<string, string>
  body: string | null
  url: string
}

/**
 * Unified response format returned by route handlers.
 */
export interface UnifiedResponse {
  status: number
  body: unknown
  headers?: Record<string, string>
}

/**
 * Function signature for calling tools.
 */
export type CallToolFn = (
  toolNameInput: unknown,
  toolArgsInput: unknown,
) => Promise<ToolCallResponse>

/**
 * Context passed to all route handlers.
 */
export interface RouteContext {
  config: RuntimeSkedyulConfig
  tools: ToolMetadata[]
  registry: ToolRegistry
  webhookRegistry?: WebhookRegistry
  callTool: CallToolFn
  state: RequestState
  mcpServer: McpServer
  defaultHeaders: Record<string, string>
}

/**
 * Parsed JSON body with optional method field (for JSON-RPC style requests).
 */
export interface ParsedJsonRpcBody {
  jsonrpc?: string
  id?: unknown
  method?: string
  params?: Record<string, unknown>
}

/**
 * MCP tools/call arguments in Skedyul format.
 */
export interface SkedyulToolCallArgs {
  inputs?: Record<string, unknown>
  context?: Record<string, unknown>
  env?: Record<string, string>
  invocation?: InvocationContext
  estimate?: boolean
}

/**
 * Result type for JSON parsing operations.
 */
export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: UnifiedResponse }
