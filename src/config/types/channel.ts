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
 * Who may start a conversation on a channel.
 * - `business`: the workplace can message anyone it has an identifier for
 *   (phone number, email address). This is the default.
 * - `contact`: the person must message the channel first. The workplace can
 *   only reply to people who already have a subscription on this channel
 *   (for example Page- or account-scoped IDs on social messaging channels).
 *   New threads only offer those people, and bulk sends are not allowed.
 */
export type ChannelInitiation = 'business' | 'contact'

/**
 * Free-form messaging window. Free-form messages are only allowed within
 * `hours` of the contact's last inbound message. Outside it the platform
 * sends via an approved provider template (when `templates` is declared) or
 * does not send at all.
 */
export interface ChannelMessagingWindow {
  hours: number
}

/**
 * Provider-approved message templates (tool handles). The platform creates a
 * template from the outgoing text, waits for the provider to approve it
 * (reported with `communicationChannel.updateTemplateStatus`), sends the
 * message with `message.template`, then deletes the template.
 */
export interface ChannelTemplatesCapability {
  /** Tool taking `MessageTemplateCreateInput`, returning `MessageTemplateCreateOutput`. */
  create: string
  /** Tool taking `MessageTemplateDeleteInput`. */
  delete?: string
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
   *
   * Ignored when `initiation` is `contact`.
   */
  send_batch?: string | ChannelBatchCapability
  /**
   * Who may start a conversation. Defaults to `business`.
   * See {@link ChannelInitiation}.
   */
  initiation?: ChannelInitiation
  /** Free-form messaging window. See {@link ChannelMessagingWindow}. */
  window?: ChannelMessagingWindow
  /** Provider templates for sending outside the window. See {@link ChannelTemplatesCapability}. */
  templates?: ChannelTemplatesCapability
}

/** Which inbound conversations go to Ask Skedyul. */
export type AskSkedyulConversation = 'direct' | 'group'

/**
 * How the platform finds the workplace for a message.
 * - 'installation': the channel belongs to one workplace (a Slack team).
 * - 'shared': the same channel identifier is installed in many workplaces
 *   (one phone number for every workplace). The platform picks the workplace
 *   per conversation: saved link, then the sender's identity, then a link code.
 */
export type AskSkedyulAddressing = 'installation' | 'shared'

/** Sender identity hints the platform matches to a workplace member. */
export type AskSkedyulMemberMatch = 'email' | 'phone'

/**
 * When Ask Skedyul replies in a group conversation.
 * - 'mentioned': only to messages that mention it (`receiveMessage({ mentioned: true })`).
 * - 'all': to every message from a member.
 * Every message is still stored, so Ask Skedyul has the context.
 */
export type AskSkedyulGroupReplies = 'mentioned' | 'all'

/**
 * Opts a channel in to Ask Skedyul: team members message Skedyul's assistant
 * through it instead of the channel carrying customer conversations.
 *
 * The app's webhook keeps calling `communicationChannel.receiveMessage`, with
 * an `identity` hint for `matchMemberBy`. Messages whose conversation kind is
 * listed in `conversations` go to Ask Skedyul; others keep the `messaging`
 * path.
 */
export interface AskSkedyulCapability {
  /** Display name on the Ask Skedyul card (e.g., 'WhatsApp', 'Slack') */
  label: string
  /** Lucide icon name */
  icon?: string
  /** 'direct' = 1:1 (no `group` on receiveMessage); 'group' = group chats */
  conversations: AskSkedyulConversation[]
  addressing: AskSkedyulAddressing
  /** Identity hints to match, in order. Each must arrive on `identity`. */
  matchMemberBy: AskSkedyulMemberMatch[]
  /** Group conversations only. Defaults to 'mentioned'. */
  groupReplies?: AskSkedyulGroupReplies
  /** Outbound tool for Ask Skedyul's replies (same input as messaging.send) */
  send: string
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
  /**
   * Product logo. An https URL or an SVG data URI.
   * Surfaces prefer this over the Lucide icon and the app icon.
   */
  iconUrl?: string
  /** Field definitions for channel. One field must have identifier: true. */
  fields: ChannelField[]
  /** Capabilities keyed by type (messaging, voice, video), plus Ask Skedyul */
  capabilities: Partial<Record<CapabilityType, ChannelCapability>> & {
    askSkedyul?: AskSkedyulCapability
  }
}
