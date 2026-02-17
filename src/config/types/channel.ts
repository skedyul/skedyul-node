import type { AppFieldVisibility } from './model'

// ─────────────────────────────────────────────────────────────────────────────
// Channel Definition
// ─────────────────────────────────────────────────────────────────────────────

/** Standard capability types for communication channels */
export type ChannelCapabilityType = 'messaging' | 'voice' | 'video'

/** Capability definition with display info and handler references */
export interface ChannelCapability {
  /** Display name: "SMS", "WhatsApp Messages" */
  name: string
  /** Lucide icon name */
  icon?: string
  /** Inbound webhook handler */
  receive?: string
  /** Outbound tool handle */
  send?: string
}

export interface ChannelFieldPermissions {
  read?: boolean
  write?: boolean
}

/**
 * Field definition for channel field mappings.
 * One field should have identifier: true to mark it as the channel identifier.
 */
export interface ChannelFieldDefinition {
  handle: string
  label: string
  definition: { handle: string }
  /** Marks this field as the identifier field for the channel */
  identifier?: boolean
  required?: boolean
  defaultValue?: { value: unknown }
  visibility?: AppFieldVisibility
  permissions?: ChannelFieldPermissions
}

export interface ChannelDefinition {
  handle: string
  name: string
  icon?: string
  /** Field definitions for channel. One field must have identifier: true. */
  fields: ChannelFieldDefinition[]
  /** Capabilities keyed by standard type (messaging, voice, video) */
  capabilities: Partial<Record<ChannelCapabilityType, ChannelCapability>>
}
