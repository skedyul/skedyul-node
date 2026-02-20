/**
 * Context-Aware Logger
 * ====================
 * 
 * Provides a logger interface that can be attached to handler contexts.
 * The logger wraps console methods, and since console.log is patched by
 * context-logger.ts to inject invocation context from AsyncLocalStorage,
 * all logs automatically include the context.
 * 
 * Usage:
 *   context.log('Starting operation...')
 *   context.log.info('Info message')
 *   context.log.error('Error occurred', error)
 */

export interface ContextLogger {
  (message: string, ...args: unknown[]): void
  info: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
  error: (message: string, ...args: unknown[]) => void
  debug: (message: string, ...args: unknown[]) => void
}

/**
 * Creates a context logger instance.
 * The logger simply wraps console methods - the AsyncLocalStorage patch
 * in context-logger.ts handles injecting the invocation context automatically.
 */
export function createContextLogger(): ContextLogger {
  const log = ((msg: string, ...args: unknown[]) => {
    console.log(msg, ...args)
  }) as ContextLogger

  log.info = (msg: string, ...args: unknown[]) => {
    console.info(msg, ...args)
  }

  log.warn = (msg: string, ...args: unknown[]) => {
    console.warn(msg, ...args)
  }

  log.error = (msg: string, ...args: unknown[]) => {
    console.error(msg, ...args)
  }

  log.debug = (msg: string, ...args: unknown[]) => {
    console.debug(msg, ...args)
  }

  return log
}
