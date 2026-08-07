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
 * When an install-scoped variable is collected from the user vs set by the app/platform.
 * - 'pre_install': user fills on the install page before Install is clicked
 * - 'post_install': set by OAuth callback, install handler, or runtime (never on pre-install form)
 */
export type InstallPhase = 'pre_install' | 'post_install'

/**
 * Environment variable definition.
 */
export interface EnvVariable {
  /** Human-readable label for the variable */
  label: string
  /** Scope: 'provision' (developer) or 'install' (user) */
  scope?: EnvScope
  /** When to collect install-scoped vars (default: 'pre_install') */
  installPhase?: InstallPhase
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
