/**
 * Base types and common definitions for the Skedyul config system.
 *
 * ## NAMING CONVENTIONS
 *
 * ### Type Literals
 * All type literals use **lowercase** (e.g., 'string', 'internal', 'one_to_many').
 * This is more modern, aligns with TypeScript conventions, and is easier to type.
 *
 * ### Identifiers
 * - `handle`: Unique identifier within the app (snake_case, e.g., 'compliance_record')
 * - `label`: Human-readable display name
 * - `description`: Optional explanatory text for documentation/UI
 *
 * ### Boolean Properties
 * - Use bare names for static booleans (e.g., `required`, `disabled`, `hidden`)
 * - Use `is` prefix only for computed/dynamic booleans that support Liquid templates
 *   (e.g., `isDisabled: boolean | string` where string is a Liquid template)
 *
 * ### Definition Types
 * All definition types (Model, Channel, Page, Workflow, Agent) extend `BaseDefinition`
 * which provides the common `handle`, `label`, and `description` properties.
 *
 * ## FILE STRUCTURE
 *
 * The config types are organized into focused modules:
 * - `base.ts` - Common types (BaseDefinition, Scope, FieldOwner, etc.)
 * - `model.ts` - Model and field definitions
 * - `channel.ts` - Channel definitions
 * - `workflow.ts` - Workflow definitions
 * - `agent.ts` - Agent definitions
 * - `page.ts` - Page definitions
 * - `form.ts` - Form component definitions
 * - `navigation.ts` - Navigation definitions
 * - `context.ts` - Page context definitions
 * - `env.ts` - Environment variable definitions
 *
 * ## SCOPE SYSTEM
 *
 * Resources can have two scopes:
 * - `'internal'`: App-owned, created once per app version during provisioning
 * - `'shared'`: User-mapped, configured during installation to link to existing data
 *
 * The scope is declared as a property on the resource, not by file location.
 */

/**
 * Base interface for all definition types.
 * All models, channels, workflows, pages, agents, etc. extend this.
 */
export interface BaseDefinition {
  /** Unique identifier within the app (snake_case, e.g., 'compliance_record') */
  handle: string
  /** Human-readable display name */
  label: string
  /** Optional description for documentation/UI */
  description?: string
}

/**
 * Scope determines when and how a resource is created.
 * - 'internal': App-owned, created once per app version during provisioning
 * - 'shared': User-mapped, configured during installation to link to existing data
 */
export type Scope = 'internal' | 'shared'

/**
 * Field owner determines who controls the field definition.
 * - 'app': App controls the definition (options, validation). Creates app-scoped definitions.
 * - 'shared': Workplace controls the definition. Field can be shared across apps.
 */
export type FieldOwner = 'app' | 'shared'

/**
 * Visibility setting for environment variables.
 * - 'visible': Value is shown in UI
 * - 'encrypted': Value is hidden/masked in UI
 */
export type Visibility = 'visible' | 'encrypted'

/**
 * Compute layer determines how the app runs.
 * - 'serverless': AWS Lambda - fast cold starts, pay-per-use, auto-scaling
 * - 'dedicated': ECS/Docker - persistent connections, custom runtimes
 */
export type ComputeLayer = 'serverless' | 'dedicated'

/**
 * Standard filter type used for querying data.
 * Re-exported from schemas for backwards compatibility.
 * Format: { fieldHandle: { operator: value } }
 * Operators: eq, neq, gt, gte, lt, lte, in, contains, etc.
 */
export type { StructuredFilter, FilterOperator, FilterCondition } from '../../schemas'

/**
 * Option for select/dropdown fields.
 */
export interface FieldOption {
  /** Display text */
  label: string
  /** Stored value */
  value: string
  /** Optional color for status indicators (e.g., 'yellow', 'green', 'red') */
  color?: string
}
