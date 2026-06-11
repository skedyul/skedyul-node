/**
 * MCP HTTP Client utilities for CLI commands.
 *
 * Provides helpers for making JSON-RPC calls to local MCP servers,
 * matching the payload format used by the worker-compute activities.
 */

import * as http from 'http'

const DEFAULT_TIMEOUT_MS = 120_000

export interface McpJsonRpcResponse {
  jsonrpc: string
  id: unknown
  result?: {
    content?: Array<{ type?: string; text?: unknown }>
    structuredContent?: Record<string, unknown>
    isError?: boolean
    tools?: unknown[]
    cursor?: unknown
    billing?: unknown
  }
  error?: { code?: number; message?: string }
}

export interface McpToolCallResult {
  success: boolean
  output: unknown
  error?: string
  billing?: unknown
  cursor?: unknown
  isError?: boolean
}

export interface McpToolCallOptions {
  baseUrl: string
  toolName: string
  inputs?: Record<string, unknown>
  context?: Record<string, unknown>
  env?: Record<string, string>
  timeoutMs?: number
}

/**
 * Make an HTTP request to a local server.
 */
export function makeHttpRequest(
  hostname: string,
  port: number,
  path: string,
  method: string,
  body?: unknown,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : undefined

    const options: http.RequestOptions = {
      hostname,
      port,
      path,
      method,
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        // MCP Streamable HTTP transport requires clients to accept both JSON and SSE
        Accept: 'application/json, text/event-stream',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
      },
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {}
          resolve({ status: res.statusCode ?? 0, body: parsed })
        } catch {
          resolve({ status: res.statusCode ?? 0, body: data })
        }
      })
    })

    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error(`Request timed out after ${timeoutMs}ms`))
    })

    if (postData) {
      req.write(postData)
    }
    req.end()
  })
}

/**
 * Parse a URL into hostname and port.
 */
function parseUrl(url: string): { hostname: string; port: number } {
  const parsed = new URL(url)
  const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80)
  return { hostname: parsed.hostname, port }
}

/**
 * POST a JSON-RPC request to an MCP server.
 */
export async function postJsonRpc(
  baseUrl: string,
  method: string,
  params: unknown,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<McpJsonRpcResponse> {
  const { hostname, port } = parseUrl(baseUrl)
  const body = {
    jsonrpc: '2.0',
    id: Date.now().toString(),
    method,
    params,
  }

  const response = await makeHttpRequest(hostname, port, '/mcp', 'POST', body, timeoutMs)

  if (response.status !== 200) {
    throw new Error(`MCP request failed with status ${response.status}`)
  }

  return response.body as McpJsonRpcResponse
}

/**
 * Check if a local MCP server is healthy.
 */
export async function checkHealth(baseUrl: string, timeoutMs: number = 5000): Promise<boolean> {
  try {
    const { hostname, port } = parseUrl(baseUrl)
    const response = await makeHttpRequest(hostname, port, '/health', 'GET', undefined, timeoutMs)
    return response.status === 200
  } catch {
    return false
  }
}

/**
 * Call tools/list on an MCP server.
 */
export async function listMcpTools(
  baseUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<{ success: boolean; tools?: unknown[]; error?: string }> {
  try {
    const response = await postJsonRpc(baseUrl, 'tools/list', {}, timeoutMs)

    if (response.error) {
      return {
        success: false,
        error: `tools/list error: ${response.error.message ?? JSON.stringify(response.error)}`,
      }
    }

    if (!response.result?.tools) {
      return {
        success: false,
        error: 'tools/list response missing result.tools',
      }
    }

    return {
      success: true,
      tools: response.result.tools,
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to call tools/list: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * Call tools/call on an MCP server with the Skedyul payload format.
 *
 * Builds the same payload structure as worker-compute/src/activities/mcp-http.ts
 */
export async function callMcpTool(options: McpToolCallOptions): Promise<McpToolCallResult> {
  const { baseUrl, toolName, inputs = {}, context = {}, env = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = options

  const params = {
    name: toolName,
    arguments: {
      inputs,
      context,
      env,
    },
  }

  const response = await postJsonRpc(baseUrl, 'tools/call', params, timeoutMs)

  return parseMcpToolCallResult(response)
}

/**
 * Parse the MCP tools/call response into a structured result.
 */
export function parseMcpToolCallResult(response: McpJsonRpcResponse): McpToolCallResult {
  if (response.error) {
    return {
      success: false,
      output: null,
      error: `MCP error ${response.error.code ?? ''}: ${response.error.message ?? 'Unknown error'}`,
    }
  }

  const result = response.result
  if (!result) {
    return {
      success: false,
      output: null,
      error: 'MCP response missing result',
    }
  }

  if (result.isError) {
    const structuredContent = result.structuredContent as Record<string, unknown> | undefined
    const errorMessage = String(
      structuredContent?.error ??
        (result.content?.[0]?.text as string) ??
        'Tool execution failed',
    )
    return {
      success: false,
      output: null,
      error: errorMessage,
      billing: result.billing,
    }
  }

  let output: unknown = null
  if (result.content && result.content.length > 0) {
    const textContent = result.content[0]?.text
    if (typeof textContent === 'string') {
      try {
        output = JSON.parse(textContent)
      } catch {
        output = textContent
      }
    } else {
      output = textContent
    }
  }

  if (result.structuredContent) {
    const sc = result.structuredContent as Record<string, unknown>
    const { __effect, __dataBlocks, __cursor, __warnings, __pagination, ...cleanOutput } = sc
    if (Object.keys(cleanOutput).length > 0) {
      output = cleanOutput
    }
  }

  return {
    success: true,
    output,
    billing: result.billing,
    cursor: result.cursor ?? (result.structuredContent as Record<string, unknown>)?.__cursor,
  }
}
