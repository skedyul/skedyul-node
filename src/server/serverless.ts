import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type {
  APIGatewayProxyEvent,
  SkedyulServerInstance,
  ToolCallResponse,
  ToolMetadata,
} from '../types'
import type { RuntimeSkedyulConfig } from './index'
import type { RequestState } from './types'
import { printStartupLog } from './startup-logger'
import { getDefaultHeaders } from './utils'
import {
  fromLambdaEvent,
  toLambdaResponse,
  routeRequest,
  type RouteContext,
} from './route-handlers'

/**
 * Creates a serverless (Lambda-style) server instance
 */
export function createServerlessInstance(
  config: RuntimeSkedyulConfig,
  tools: ToolMetadata[],
  callTool: (toolNameInput: unknown, toolArgsInput: unknown) => Promise<ToolCallResponse>,
  state: RequestState,
  mcpServer: McpServer,
): SkedyulServerInstance {
  const defaultHeaders = getDefaultHeaders(config.cors)
  const registry = config.tools
  const webhookRegistry = config.webhooks

  let hasLoggedStartup = false

  const ctx: RouteContext = {
    config,
    tools,
    registry,
    webhookRegistry,
    callTool,
    state,
    mcpServer,
    defaultHeaders,
  }

  return {
    async handler(event: APIGatewayProxyEvent) {
      if (!hasLoggedStartup) {
        printStartupLog(config, tools)
        hasLoggedStartup = true
      }

      const req = fromLambdaEvent(event)
      const response = await routeRequest(req, ctx)
      return toLambdaResponse(response, defaultHeaders)
    },
    getHealthStatus: () => state.getHealthStatus(),
  }
}
