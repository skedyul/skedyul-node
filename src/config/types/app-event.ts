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
}
