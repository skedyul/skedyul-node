/**
 * Parses a JSON string into a Record, returning empty object on failure
 */
export function parseJsonRecord(value?: string): Record<string, string> {
  if (!value) {
    return {}
  }
  try {
    return JSON.parse(value) as Record<string, string>
  } catch {
    return {}
  }
}

/**
 * Parses a string environment variable as a number
 */
export function parseNumberEnv(value?: string): number | null {
  if (!value) {
    return null
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * Merges baked-in environment variables with runtime environment variables
 */
export function mergeRuntimeEnv(): void {
  const bakedEnv = parseJsonRecord(process.env.MCP_ENV_JSON)
  const runtimeEnv = parseJsonRecord(process.env.MCP_ENV)
  const merged = { ...bakedEnv, ...runtimeEnv }
  Object.assign(process.env, merged)
}
