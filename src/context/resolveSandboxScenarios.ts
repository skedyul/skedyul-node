import type { AgentContext, SandboxConfig } from './types'

export const LEGACY_DEFAULT_SANDBOX_SCENARIO_ID = 'default'

export type SandboxScenarioListItem = {
  id: string
  label: string
}

function legacyContextFromSandbox(
  sandbox: SandboxConfig | undefined,
): AgentContext | undefined {
  if (!sandbox) return undefined
  if (sandbox.context) return sandbox.context
  if (sandbox.mockContext) return sandbox.mockContext
  return undefined
}

/**
 * Normalize sandbox config into a list of scenarios for UI and merge resolution.
 * Legacy single `context` / `mockContext` becomes one scenario with id `default`.
 */
export function listSandboxScenarios(
  sandbox: SandboxConfig | undefined,
): SandboxScenarioListItem[] {
  if (!sandbox) return []

  const entries = sandbox.scenarios
    ? Object.entries(sandbox.scenarios)
    : null

  if (entries && entries.length > 0) {
    return entries.map(([id, scenario]) => ({
      id,
      label: scenario.label?.trim() || id,
    }))
  }

  const legacy = legacyContextFromSandbox(sandbox)
  if (legacy) {
    return [{ id: LEGACY_DEFAULT_SANDBOX_SCENARIO_ID, label: 'Default' }]
  }

  return []
}

export function resolveDefaultSandboxScenarioId(
  sandbox: SandboxConfig | undefined,
): string | undefined {
  const scenarios = listSandboxScenarios(sandbox)
  if (scenarios.length === 0) return undefined

  const preferred = sandbox?.defaultScenario?.trim()
  if (preferred && scenarios.some((s) => s.id === preferred)) {
    return preferred
  }

  return scenarios[0]?.id
}

/**
 * Resolve YAML merge base for sandbox: selected scenario context, or legacy single context.
 */
export function resolveSandboxScenarioContext(
  sandbox: SandboxConfig | undefined,
  scenarioId?: string | null,
): AgentContext | undefined {
  if (!sandbox) return undefined

  const scenarios = sandbox.scenarios
  if (scenarios && Object.keys(scenarios).length > 0) {
    const id =
      scenarioId?.trim() ||
      resolveDefaultSandboxScenarioId(sandbox) ||
      Object.keys(scenarios)[0]
    const scenario = id ? scenarios[id] : undefined
    if (scenario?.context) return scenario.context
    const firstKey = Object.keys(scenarios)[0]
    return firstKey ? scenarios[firstKey]?.context : undefined
  }

  return legacyContextFromSandbox(sandbox)
}

/**
 * Full scenario list with context payloads (for client init / scenario switch).
 */
export function listSandboxScenariosWithContext(
  sandbox: SandboxConfig | undefined,
): Array<SandboxScenarioListItem & { context: AgentContext }> {
  if (!sandbox) return []

  const entries = sandbox.scenarios
    ? Object.entries(sandbox.scenarios)
    : null

  if (entries && entries.length > 0) {
    return entries.map(([id, scenario]) => ({
      id,
      label: scenario.label?.trim() || id,
      context: scenario.context,
    }))
  }

  const legacy = legacyContextFromSandbox(sandbox)
  if (legacy) {
    return [
      {
        id: LEGACY_DEFAULT_SANDBOX_SCENARIO_ID,
        label: 'Default',
        context: legacy,
      },
    ]
  }

  return []
}
