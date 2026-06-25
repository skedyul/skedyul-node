/**
 * App signal definition for provision config.
 *
 * Signals are UI-facing names for event types: signal.{appHandle}.{name}
 * Install-time provisioning creates EventSubscription + EVENT trigger rows.
 */
export interface SignalDefinition {
  /** Short signal name, e.g. "customer.sync" → signal.shopify.customer.sync */
  name: string
  /** UI display name */
  label?: string
  /** Human-readable description */
  description?: string
  /** Bundled workflow handle, e.g. "sync-customers" or "@shopify/sync-customers" */
  workflowHandle: string
  /** Default Liquid input mappings for the subscribed workflow */
  inputMappings?: Record<string, string>
  /** Optional EventSubscription condition filter */
  condition?: string
}
