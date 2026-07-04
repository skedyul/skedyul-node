/**
 * App event definition for integration executable config.
 *
 * Events are emitted via event.create and subscribed to as
 * `app.{appHandle}.{name}` (e.g. app.bft.member.updated).
 */
export interface AppEventDefinition {
  /** Event suffix after app handle, e.g. member.created */
  name: string
  /** UI display label */
  label: string
  /** Optional description for pickers and docs */
  description?: string
  /** Optional grouping label (Members, Bookings, etc.) */
  group?: string
  /** Optional Lucide icon name for pickers */
  icon?: string
  /**
   * Example flat payload as passed to event.create (before envelope wrapping).
   * Used by the liquid context editor for path picking and sample values.
   */
  examplePayload?: Record<string, unknown>
  /**
   * Typed context field tree for liquid input path browsing (data.* paths).
   * When set, subscribers see explicit fields like data.member.phone.
   */
  contextFields?: AppEventContextField[]
}

export interface AppEventContextField {
  path: string
  label: string
  type?: string
  description?: string
  children?: AppEventContextField[]
}
