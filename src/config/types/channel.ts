/**
 * Channel definition types.
 *
 * Channels represent communication methods (SMS, email, WhatsApp, etc.)
 * that an app can use to interact with users.
 */

import type { BaseDefinition, FieldOwner } from './base'
import type { FieldVisibility } from './model'

/**
 * Channel capability types.
 * - 'messaging': Text-based messaging (SMS, chat, etc.)
 * - 'voice': Voice calls
 * - 'video': Video calls
 */
export type CapabilityType = 'messaging' | 'voice' | 'video'

/**
 * Capability definition with display info and handler references.
 */
export interface ChannelCapability {
  /** Display name (e.g., 'SMS', 'WhatsApp Messages') */
  label: string
  /** Lucide icon name */
  icon?: string
  /** Inbound webhook handler name */
  receive?: string
  /** Outbound tool handle */
  send?: string
}

/**
 * Field permissions for channel fields.
 */
export interface ChannelFieldPermissions {
  read?: boolean
  write?: boolean
}

/**
 * Field definition for channel field mappings.
 */
export interface ChannelField {
  /** Unique identifier within the channel */
  handle: string
  /** Human-readable display name */
  label: string
  /** Reference to a field definition by handle */
  definitionHandle: string
  /** Marks this field as the identifier field for the channel */
  identifier?: boolean
  /** Whether this field is required */
  required?: boolean
  /** Default value for new records */
  default?: unknown
  /** Visibility settings */
  visibility?: FieldVisibility
  /** Field permissions */
  permissions?: ChannelFieldPermissions
  /** Who can modify this field */
  owner?: FieldOwner
}

/**
 * Channel definition.
 */
export interface ChannelDefinition extends BaseDefinition {
  /** Lucide icon name */
  icon?: string
  /** Field definitions for channel. One field must have identifier: true. */
  fields: ChannelField[]
  /** Capabilities keyed by type (messaging, voice, video) */
  capabilities: Partial<Record<CapabilityType, ChannelCapability>>
}
