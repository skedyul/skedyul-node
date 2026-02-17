// ─────────────────────────────────────────────────────────────────────────────
// Env Variable Definition
// ─────────────────────────────────────────────────────────────────────────────

export type EnvVisibility = 'visible' | 'encrypted'

export interface EnvVariableDefinition {
  /** Human-readable label for the variable */
  label: string
  /** Whether this variable is required */
  required?: boolean
  /** Visibility setting (encrypted values are hidden in UI) */
  visibility?: EnvVisibility
  /** Default value if not provided */
  default?: string
  /** Description/help text */
  description?: string
  /** Placeholder text for input fields */
  placeholder?: string
}

export type EnvSchema = Record<string, EnvVariableDefinition>
