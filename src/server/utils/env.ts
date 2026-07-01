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
 * Baked-in secrets for this executable (container/Lambda), not the full OS process.env.
 */
export function getBakedExecutableEnv(): Record<string, string> {
  return {
    ...parseJsonRecord(process.env.MCP_ENV_JSON),
    ...parseJsonRecord(process.env.MCP_ENV),
  }
}

/**
 * Env exposed to tool handlers.
 *
 * Layering (lowest → highest priority):
 * 1. process.env — container-local values (`dev serve` loads provision secrets here)
 * 2. MCP_ENV_JSON / MCP_ENV — baked secrets in deployed containers
 * 3. requestEnv — per-request runtime values from the platform (token, API URL)
 */
export function buildToolExecutionEnv(
  requestEnv: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  const bakedEnv = getBakedExecutableEnv()
  const merged: Record<string, string | undefined> = {}

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      merged[key] = value
    }
  }

  Object.assign(merged, bakedEnv)

  for (const [key, value] of Object.entries(requestEnv)) {
    if (value !== undefined) {
      merged[key] = value
    }
  }

  return merged
}

/**
 * Merges baked-in environment variables with runtime environment variables
 */
export function mergeRuntimeEnv(): void {
  const merged = getBakedExecutableEnv()
  Object.assign(process.env, merged)
}
