/**
 * App install setup step definition for provision config.
 *
 * Declared steps are seeded onto each AppInstallation as AppInstallSetupStep
 * rows. Apps and the platform UI read/update status via the setup.* Core API.
 */

export type SetupStepKind = 'app' | 'crm' | 'realtime' | 'env'

export interface SetupStepDefinition {
  /** Stable step handle (unique within the app) */
  handle: string
  /** UI label */
  label: string
  /** Optional longer description */
  description?: string
  /** Step kind — drives default CTAs and listeners */
  kind: SetupStepKind
  /** Prerequisite step handles that must be READY */
  requires?: string[]
  /** CRM entity handles this step covers (kind: crm) */
  entities?: string[]
  /** Bundled workflow handles this step wires (kind: realtime) */
  workflowHandles?: string[]
  /** Env keys this step depends on (kind: env) */
  envKeys?: string[]
  /**
   * When true, platform emits install.setup.crm_changed after CRM migrations
   * and invokes hooks.setup.revalidate so the app can complete/invalidate.
   */
  listenToCrm?: boolean
  /**
   * When true, platform emits install.setup.env_changed when matching env
   * keys are removed/cleared and invokes hooks.setup.revalidate.
   */
  listenToEnv?: boolean
  /** Capability keys unlocked when this step is READY */
  capabilities?: string[]
  /**
   * Optional tool handle for an APP-step CTA (invoked as page_action with no form).
   * Declared by the app — platform UI must not hardcode app/tool names.
   */
  actionTool?: string
  /** Optional label for the APP-step CTA button */
  actionLabel?: string
  /**
   * Optional install-relative path for post-setup navigation
   * (e.g. `/leads`). Prefer entity pages over industry-specific defaults.
   */
  href?: string
}
