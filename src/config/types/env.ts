/**
 * Environment variable definition types.
 *
 * Environment variables can have two scopes:
 * - 'provision': Developer-configured, shared across all installations
 * - 'install': User-configured during app installation
 */

import type { Visibility } from './base'

/**
 * Scope for environment variables.
 * - 'provision': Developer-configured, shared across all installations
 * - 'install': User-configured during app installation
 */
export type EnvScope = 'provision' | 'install'

/**
 * Environment variable definition.
 */
export interface EnvVariable {
  /** Human-readable label for the variable */
  label: string
  /** Scope: 'provision' (developer) or 'install' (user) */
  scope?: EnvScope
  /** Whether this variable is required */
  required?: boolean
  /** Visibility setting: 'visible' or 'encrypted' */
  visibility?: Visibility
  /** Default value if not provided */
  default?: string
  /** Description/help text */
  description?: string
  /** Placeholder text for input fields */
  placeholder?: string
}

/**
 * Environment variable schema.
 * Keys are variable names (e.g., 'TWILIO_ACCOUNT_SID').
 */
export type EnvSchema = Record<string, EnvVariable>
