import type { SkedyulServerConfig, ToolMetadata, WebhookRegistry } from '../types'
import { parseNumberEnv } from './utils'

/**
 * Pad a string to the right with spaces
 */
export function padEnd(str: string, length: number): string {
  if (str.length >= length) {
    return str.slice(0, length)
  }
  return str + ' '.repeat(length - str.length)
}

/**
 * Prints a styled startup log showing server configuration
 */
export function printStartupLog(
  config: SkedyulServerConfig,
  tools: ToolMetadata[],
  webhookRegistry?: WebhookRegistry,
  port?: number,
): void {
  // Skip startup log during tests
  if (process.env.NODE_ENV === 'test') {
    return
  }

  const webhookCount = webhookRegistry ? Object.keys(webhookRegistry).length : 0
  const webhookNames = webhookRegistry ? Object.keys(webhookRegistry) : []
  const maxRequests =
    config.maxRequests ??
    parseNumberEnv(process.env.MCP_MAX_REQUESTS) ??
    null
  const ttlExtendSeconds =
    config.ttlExtendSeconds ??
    parseNumberEnv(process.env.MCP_TTL_EXTEND) ??
    3600
  const executableId = process.env.SKEDYUL_EXECUTABLE_ID || 'local'

  const divider = '═'.repeat(70)
  const thinDivider = '─'.repeat(70)

  // eslint-disable-next-line no-console
  console.log('')
  // eslint-disable-next-line no-console
  console.log(`╔${divider}╗`)
  // eslint-disable-next-line no-console
  console.log(`║  🚀 Skedyul MCP Server Starting                                      ║`)
  // eslint-disable-next-line no-console
  console.log(`╠${divider}╣`)
  // eslint-disable-next-line no-console
  console.log(`║                                                                      ║`)
  // eslint-disable-next-line no-console
  console.log(`║  📦 Server:       ${padEnd(config.metadata.name, 49)}║`)
  // eslint-disable-next-line no-console
  console.log(`║  🏷️  Version:      ${padEnd(config.metadata.version, 49)}║`)
  // eslint-disable-next-line no-console
  console.log(`║  ⚡ Compute:      ${padEnd(config.computeLayer, 49)}║`)
  if (port) {
    // eslint-disable-next-line no-console
    console.log(`║  🌐 Port:         ${padEnd(String(port), 49)}║`)
  }
  // eslint-disable-next-line no-console
  console.log(`║  🔑 Executable:   ${padEnd(executableId, 49)}║`)
  // eslint-disable-next-line no-console
  console.log(`║                                                                      ║`)
  // eslint-disable-next-line no-console
  console.log(`╟${thinDivider}╢`)
  // eslint-disable-next-line no-console
  console.log(`║                                                                      ║`)
  // eslint-disable-next-line no-console
  console.log(`║  🔧 Tools (${tools.length}):                                                       ║`)

  // List tools (max 10, then show "and X more...")
  const maxToolsToShow = 10
  const toolsToShow = tools.slice(0, maxToolsToShow)
  for (const tool of toolsToShow) {
    // eslint-disable-next-line no-console
    console.log(`║     • ${padEnd(tool.name, 61)}║`)
  }
  if (tools.length > maxToolsToShow) {
    // eslint-disable-next-line no-console
    console.log(`║     ... and ${tools.length - maxToolsToShow} more                                              ║`)
  }

  if (webhookCount > 0) {
    // eslint-disable-next-line no-console
    console.log(`║                                                                      ║`)
    // eslint-disable-next-line no-console
    console.log(`║  🪝 Webhooks (${webhookCount}):                                                     ║`)
    const maxWebhooksToShow = 5
    const webhooksToShow = webhookNames.slice(0, maxWebhooksToShow)
    for (const name of webhooksToShow) {
      // eslint-disable-next-line no-console
      console.log(`║     • /webhooks/${padEnd(name, 51)}║`)
    }
    if (webhookCount > maxWebhooksToShow) {
      // eslint-disable-next-line no-console
      console.log(`║     ... and ${webhookCount - maxWebhooksToShow} more                                              ║`)
    }
  }

  // eslint-disable-next-line no-console
  console.log(`║                                                                      ║`)
  // eslint-disable-next-line no-console
  console.log(`╟${thinDivider}╢`)
  // eslint-disable-next-line no-console
  console.log(`║                                                                      ║`)
  // eslint-disable-next-line no-console
  console.log(`║  ⚙️  Configuration:                                                   ║`)
  // eslint-disable-next-line no-console
  console.log(`║     Max Requests:    ${padEnd(maxRequests !== null ? String(maxRequests) : 'unlimited', 46)}║`)
  // eslint-disable-next-line no-console
  console.log(`║     TTL Extend:      ${padEnd(`${ttlExtendSeconds}s`, 46)}║`)
  // eslint-disable-next-line no-console
  console.log(`║                                                                      ║`)
  // eslint-disable-next-line no-console
  console.log(`╟${thinDivider}╢`)
  // eslint-disable-next-line no-console
  console.log(`║  ✅ Ready at ${padEnd(new Date().toISOString(), 55)}║`)
  // eslint-disable-next-line no-console
  console.log(`╚${divider}╝`)
  // eslint-disable-next-line no-console
  console.log('')
}
