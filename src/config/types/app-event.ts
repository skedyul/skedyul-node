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
   * Example flat domain payload for liquid context reference (e.g. glofox_id, phone, …).
   * Not the full emit payload — studio/branch metadata is added at emit time.
   */
  examplePayload?: Record<string, unknown>
  /**
   * Typed context field tree for liquid input path browsing (data.* paths).
   * When set, subscribers see explicit fields like data.phone.
   */
  contextFields?: AppEventContextField[]
  /**
   * Workflow input type for app-event payloads, e.g. @app/bft/member/updated.
   * Workflows declare this on inputs.data and subscribe with {{ data }}.
   */
  workflowInputType?: string
}

export interface AppEventContextField {
  path: string
  label: string
  type?: string
  description?: string
  children?: AppEventContextField[]
}
