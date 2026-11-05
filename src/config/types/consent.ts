/**
 * A consent dimension an app can report.
 * Workplaces bind each dimension to the installed channels it may update.
 */
export interface ConsentDimensionDefinition {
  /** Stable handle, for example `sms` or `email`. */
  handle: string
  /** Label shown when a workplace binds the dimension. */
  label: string
  /**
   * Address kind this dimension describes.
   * `null` when the dimension is not tied to an email or phone address.
   */
  identifierKind?: 'email' | 'phone' | null
  /**
   * Purpose this dimension updates. Defaults to `marketing`.
   * Marketing opt-out becomes transactional-only. Communication opt-out
   * rejects the channel.
   */
  purpose?: 'marketing' | 'communication'
}

export interface ConsentConfig {
  dimensions: ConsentDimensionDefinition[]
}
