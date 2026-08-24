/**
 * Sync direction for events:
 * - 'inbound': Events from external system → platform (e.g. Google Calendar changes)
 * - 'outbound': Events from platform CRM → external system (e.g. pushing CRM changes to Google)
 */
export type EventDirection = 'inbound' | 'outbound'

/**
 * App event definition for integration executable config.
 *
 * Events are emitted via event.create and subscribed to as
 * `app.{appHandle}.{name}` (e.g. app.acme.member.updated).
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
   * Sync direction for this event type.
   * - 'inbound': External system → platform (e.g. webhook events from Google)
   * - 'outbound': Platform CRM → external (e.g. CRM instance.updated triggers)
   * Defaults to 'inbound' for app.* events when not specified.
   */
  direction?: EventDirection
  /**
   * Example flat domain payload for liquid context reference (e.g. external_id, phone, …).
   * Not the full emit payload — studio/branch metadata is added at emit time.
   */
  examplePayload?: Record<string, unknown>
  /**
   * Typed context field tree for liquid input path browsing (data.* paths).
   * When set, subscribers see explicit fields like data.phone.
   */
  contextFields?: AppEventContextField[]
  /**
   * Workflow input type for app-event payloads, e.g. @app/acme/member/updated.
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
