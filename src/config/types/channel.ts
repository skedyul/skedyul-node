/**
 * Channel definition types.
 *
 * Channels represent communication methods (SMS, email, WhatsApp, etc.)
 * that an app can use to interact with users.
 */

import type { BaseDefinition, FieldOwner } from './base'
import type { FieldVisibility, InlineFieldDefinition } from './model'

/**
 * Channel capability types.
 * - 'messaging': Text-based messaging (SMS, chat, etc.)
 * - 'voice': Voice calls
 * - 'video': Video calls
 */
export type CapabilityType = 'messaging' | 'voice' | 'video'

/**
 * Batch messaging capability: send tool + status poll tool.
 * Prefer this over a bare `send_batch` string when status tracking is supported.
 */
export interface ChannelBatchCapability {
  /** Tool that accepts the batch and returns an externalChunkId for status polling */
  send: string
  /** Tool that fetches chunk + per-message status by externalChunkId */
  get_status: string
}

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
  /**
   * Batch outbound capability.
   * - string: send tool only (legacy)
   * - object: send tool + get_status tool for operation tracking
   */
  send_batch?: string | ChannelBatchCapability
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
  /**
   * Field definition reference or inline definition.
   * - String: References global definition (e.g., 'phone', 'email', 'system/opt_in')
   * - Object: Inline definition with options
   */
  definition?: InlineFieldDefinition | string
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
