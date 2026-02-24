// ─────────────────────────────────────────────────────────────────────────────
// MCP Protocol Types
// ─────────────────────────────────────────────────────────────────────────────
// These types define the JSON-RPC protocol used by MCP (Model Context Protocol)
// servers for tool invocation and communication.

/**
 * MCP JSON-RPC error structure
 */
export interface MCPError {
  code: number
  message: string
  data?: {
    logs?: string[]
  }
}

/**
 * MCP content item (text response)
 */
export interface MCPContentItem {
  type: 'text'
  text: string
}

/**
 * MCP result structure containing content items
 */
export interface MCPResult {
  content: MCPContentItem[]
  isError?: boolean
}

/**
 * MCP JSON-RPC response structure
 */
export interface MCPResponse {
  jsonrpc: '2.0'
  id: number | string
  result?: MCPResult
  error?: MCPError
}

/**
 * MCP JSON-RPC request structure
 */
export interface MCPRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: Record<string, unknown>
}
