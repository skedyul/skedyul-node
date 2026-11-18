/**
 * App signal definition.
 *
 * Signals are the contact/thread timeline entries an app's workflows post with
 * `contact.signal.create` / `signal.create`. Each one is referenced by a global
 * ID, `<appHandle>:<name>` (e.g. `bft:member.created`), in workflow inputs,
 * event subscriptions and scheduled-message `cancel-on` conditions.
 *
 * The platform rejects any signal an app's workflows emit that is not declared
 * here, and an app can only emit its own signals. Name them like the app's
 * events: dotted `<entity>.<past-tense verb>`, usually matching an event
 * (`member.created` ↔ `app.bft.member.created`).
 */
export interface AppSignalDefinition {
  /** Signal name after the app handle, e.g. member.created or booking.cancelled */
  name: string
  /** UI display label */
  label: string
  /** Optional description for pickers and docs */
  description?: string
  /** Optional grouping label (Members, Bookings, etc.) */
  group?: string
  /** Optional Lucide icon name for pickers */
  icon?: string
}
