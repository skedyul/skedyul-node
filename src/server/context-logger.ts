import { AsyncLocalStorage } from 'async_hooks'
import type { InvocationContext } from '../types'

interface LogContext {
  invocation?: InvocationContext
}

const logContextStorage = new AsyncLocalStorage<LogContext>()

/**
 * Runs a function with invocation context that will be automatically
 * injected into all console.log/info/warn/error calls within that scope.
 */
export function runWithLogContext<T>(
  context: LogContext,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return logContextStorage.run(context, fn)
}

/**
 * Gets the current log context from AsyncLocalStorage
 */
export function getLogContext(): LogContext | undefined {
  return logContextStorage.getStore()
}

/**
 * Safely stringify a value for logging.
 * Handles circular references and errors gracefully.
 */
function safeStringify(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * Formats a log message as a single JSON object with invocation context.
 * When Lambda's LogFormat is set to 'JSON', console.log of a single object
 * results in the object being embedded in the 'message' field, enabling
 * CloudWatch filter patterns like { $.message.invocationType = "tool_call" }.
 */
function formatLogWithContext(args: unknown[]): unknown[] {
  const context = getLogContext()
  if (!context?.invocation) {
    return args
  }

  // Stringify all arguments into a single message string
  const messageParts = args.map(arg => {
    if (typeof arg === 'string') return arg
    return safeStringify(arg)
  })

  // Return a single object that Lambda will embed in the 'message' field
  // This enables CloudWatch JSON filter patterns for server-side filtering
  return [{
    invocationType: context.invocation.invocationType,
    ...(context.invocation.toolHandle && { toolHandle: context.invocation.toolHandle }),
    ...(context.invocation.serverHookHandle && { serverHookHandle: context.invocation.serverHookHandle }),
    ...(context.invocation.appInstallationId && { appInstallationId: context.invocation.appInstallationId }),
    ...(context.invocation.toolCallId && { toolCallId: context.invocation.toolCallId }),
    ...(context.invocation.workflowId && { workflowId: context.invocation.workflowId }),
    ...(context.invocation.workflowRunId && { workflowRunId: context.invocation.workflowRunId }),
    msg: messageParts.join(' '),
  }]
}

// Store original console methods
const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
}

/**
 * Installs the context-aware logger by patching console methods.
 * This should be called once at server startup.
 */
export function installContextLogger(): void {
  console.log = (...args: unknown[]) => {
    originalConsole.log(...formatLogWithContext(args))
  }

  console.info = (...args: unknown[]) => {
    originalConsole.info(...formatLogWithContext(args))
  }

  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...formatLogWithContext(args))
  }

  console.error = (...args: unknown[]) => {
    originalConsole.error(...formatLogWithContext(args))
  }

  console.debug = (...args: unknown[]) => {
    originalConsole.debug(...formatLogWithContext(args))
  }
}

/**
 * Restores original console methods (useful for testing)
 */
export function uninstallContextLogger(): void {
  console.log = originalConsole.log
  console.info = originalConsole.info
  console.warn = originalConsole.warn
  console.error = originalConsole.error
  console.debug = originalConsole.debug
}
