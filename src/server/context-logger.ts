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
 * Formats a log message with invocation context prepended as JSON
 */
function formatLogWithContext(args: unknown[]): unknown[] {
  const context = getLogContext()
  if (!context?.invocation) {
    return args
  }

  // Create a context prefix that includes key invocation fields
  const contextPrefix = {
    invocationType: context.invocation.invocationType,
    ...(context.invocation.toolHandle && { toolHandle: context.invocation.toolHandle }),
    ...(context.invocation.serverHookHandle && { serverHookHandle: context.invocation.serverHookHandle }),
    ...(context.invocation.appInstallationId && { appInstallationId: context.invocation.appInstallationId }),
    ...(context.invocation.toolCallId && { toolCallId: context.invocation.toolCallId }),
    ...(context.invocation.workflowId && { workflowId: context.invocation.workflowId }),
    ...(context.invocation.workflowRunId && { workflowRunId: context.invocation.workflowRunId }),
  }

  // If the first argument is a string, prepend context
  if (typeof args[0] === 'string') {
    return [`[${JSON.stringify(contextPrefix)}] ${args[0]}`, ...args.slice(1)]
  }

  // If the first argument is an object, merge context into it
  if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    return [{ ...contextPrefix, ...(args[0] as object) }, ...args.slice(1)]
  }

  // Otherwise, prepend context as first argument
  return [contextPrefix, ...args]
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
