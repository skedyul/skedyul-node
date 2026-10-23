import { z } from 'zod/v4'
import { EventsConfigSchema } from '../events/types'
import { SkillRefSchema, type SkillRef } from '../skills/types'
import { PublicListingSchema } from './public-listing'
import { SandboxConfigSchema } from '../context/types'

/**
 * Agent YAML v3 Schema
 *
 * This is the new agent schema that removes stages and uses skills instead.
 * Agents are now first-class thread participants that subscribe to events
 * and react autonomously using skills and tools.
 */

export const AGENT_SCHEMA_VERSION_V3 = 'https://skedyul.com/schemas/agent/v3'

/**
 * Persona voice format configuration
 * @deprecated Use `behavior.message`. `noEmojis`, `noSignOffs`,
 * `noBulletPoints`, `noHyphens` and `maxQuestionsPerMessage` map to
 * `emojis: false`, `signOffs: false`, `bullets: strip`, `dashes: strip` and
 * `maxQuestions`. Still read when `behavior.message` does not set the rule.
 */
export const PersonaVoiceFormatV3Schema = z.object({
  maxChars: z.number().optional(),
  noEmojis: z.boolean().optional(),
  noHyphens: z.boolean().optional(),
  noBulletPoints: z.boolean().optional(),
  maxQuestionsPerMessage: z.number().optional(),
  noSignOffs: z.boolean().optional(),
})

export type PersonaVoiceFormatV3 = z.infer<typeof PersonaVoiceFormatV3Schema>

/**
 * Persona voice configuration
 */
export const PersonaVoiceV3Schema = z.object({
  style: z.string(),
  format: PersonaVoiceFormatV3Schema.optional(),
})

export type PersonaVoiceV3 = z.infer<typeof PersonaVoiceV3Schema>

/**
 * Persona configuration for agent voice and formatting
 * @deprecated Use `behavior.persona` (`name`, `voice`) and `behavior.message`.
 * Still read when `behavior.persona` does not set the key.
 */
export const PersonaV3Schema = z.object({
  name: z.string(),
  voice: PersonaVoiceV3Schema,
})

export type PersonaV3 = z.infer<typeof PersonaV3Schema>

/**
 * Tool approval configuration
 */
export const ToolApprovalConfigSchema = z.object({
  required: z.boolean().optional(),
  requiredIf: z.array(z.string()).optional(),
})

export type ToolApprovalConfig = z.infer<typeof ToolApprovalConfigSchema>

/**
 * Tool sandbox configuration for mock responses
 */
export const ToolSandboxConfigSchema = z.object({
  mock: z.unknown().optional(),
})

export type ToolSandboxConfig = z.infer<typeof ToolSandboxConfigSchema>

/**
 * Tool reference with optional approval and sandbox configuration
 * @deprecated This schema is deprecated and kept only for backward compatibility.
 * Use skills to own tools instead.
 */
export const ToolRefV3Schema = z.union([
  z.string(),
  z.object({
    tool: z.string(),
    description: z.string().optional(),
    approval: ToolApprovalConfigSchema.optional(),
    sandbox: ToolSandboxConfigSchema.optional(),
    overrides: z.record(z.string(), z.unknown()).optional(),
  }),
])

export type ToolRefV3 = z.infer<typeof ToolRefV3Schema>

/**
 * Agent tool reference - minimal config for always-available tools
 * These tools are available before any skill is loaded (e.g., system:skill:load)
 */
export const AgentToolRefSchema = z.union([
  z.string(),
  z.object({
    tool: z.string(),
    description: z.string().optional(),
    /**
     * CRM list field handles to hydrate. When set on a list tool, list
     * results include these fields. Omit to hydrate every field.
     */
    fields: z.array(z.string().min(1)).optional(),
    /**
     * Base filter locked onto every call of a list, count or aggregate tool,
     * e.g. `{ active: { eq: true } }`. The model's own filter is ANDed with it.
     */
    where: z.record(z.string(), z.unknown()).optional(),
  }),
])

export type AgentToolRef = z.infer<typeof AgentToolRefSchema>

/**
 * @deprecated Use AgentToolRefSchema instead. This is kept for backward compatibility.
 */
export const BootstrapToolRefSchema = AgentToolRefSchema

/**
 * @deprecated Use AgentToolRef instead. This is kept for backward compatibility.
 */
export type BootstrapToolRef = AgentToolRef

/**
 * Memory configuration for working memory
 * @deprecated Not yet implemented - this is a planned feature. Fields are accepted but not used at runtime.
 */
export const WorkingMemoryConfigSchema = z.object({
  strategy: z.enum(['full', 'rolling_summary', 'sliding_window']).optional(),
  maxTokens: z.number().optional(),
  summarizeAt: z.number().optional(),
})

export type WorkingMemoryConfig = z.infer<typeof WorkingMemoryConfigSchema>

/**
 * Memory configuration for external data
 * @deprecated Not yet implemented - this is a planned feature. Fields are accepted but not used at runtime.
 */
export const ExternalMemoryConfigSchema = z.object({
  enabled: z.boolean().optional(),
  ttl: z.string().optional(),
})

export type ExternalMemoryConfig = z.infer<typeof ExternalMemoryConfigSchema>

/**
 * Memory configuration for semantic search
 * @deprecated Not yet implemented - this is a planned feature. Fields are accepted but not used at runtime.
 */
export const SemanticMemoryConfigSchema = z.object({
  enabled: z.boolean().optional(),
  topK: z.number().optional(),
  scope: z.enum(['thread', 'instance', 'workspace']).optional(),
})

export type SemanticMemoryConfig = z.infer<typeof SemanticMemoryConfigSchema>

/**
 * Full memory configuration
 * @deprecated Not yet implemented - this is a planned feature. Fields are accepted but not used at runtime.
 */
export const MemoryConfigV3Schema = z.object({
  working: WorkingMemoryConfigSchema.optional(),
  persistent: z
    .object({
      namespace: z.string().optional(),
    })
    .optional(),
  external: ExternalMemoryConfigSchema.optional(),
  semantic: SemanticMemoryConfigSchema.optional(),
})

export type MemoryConfigV3 = z.infer<typeof MemoryConfigV3Schema>

const RequiresApprovalPolicySchema = z.object({
  requiresApproval: z.boolean().optional(),
})

/**
 * Policies configuration.
 * Business constraints belong in `prompts.system`. Message/tool approval
 * flags are enforced by the thread agent workflow after each run.
 */
export const PoliciesConfigV3Schema = z.object({
  messages: z
    .object({
      send: RequiresApprovalPolicySchema.optional(),
      schedule: RequiresApprovalPolicySchema.optional(),
    })
    .optional(),
  tools: z
    .object({
      externalRequiresApproval: z.boolean().optional(),
      systemRequiresApproval: z.boolean().optional(),
    })
    .optional(),
})

export type PoliciesConfigV3 = z.infer<typeof PoliciesConfigV3Schema>

/**
 * Runtime configuration
 * `model` selects the main reasoning LLM; `personaModel` selects the model
 * used to apply persona voice/style to outbound messages.
 */
export const RuntimeConfigV3Schema = z.object({
  /** LLM model identifier for reasoning (e.g., "google/gemini-3.1-flash-lite") */
  model: z.string().optional(),
  /** LLM model for persona transformation (e.g., "openai/gpt-5-nano") */
  personaModel: z.string().optional(),
  /**
   * Model steps per run, 1-50.
   * @default 10
   */
  maxIterations: z.number().int().min(1).max(50).optional(),
})

export type RuntimeConfigV3 = z.infer<typeof RuntimeConfigV3Schema>

/**
 * Harness skill routing. When enabled, a router model step picks the skills
 * for the turn from `skills[].description`, Liquid `guidance` (inject
 * `{{ state.crm… }}` and other `state.*` paths), and the recent messages.
 * The chosen skills are loaded before the main model runs and
 * `system:skill:load` is not offered.
 *
 * Guidance is shown to the router only, never the main prompt.
 */
export const RoutingConfigV3Schema = z.object({
  enabled: z.boolean().optional(),
  /** How to pick skills. Router prompt only. Liquid can inject `state.*`. */
  guidance: z.string().optional(),
  /** Skill handles loaded when the router returns nothing or fails. */
  fallback: z.array(z.string().min(1)).optional(),
  /** Router model. Defaults to `runtime.model`. */
  model: z.string().optional(),
})

export type RoutingConfigV3 = z.infer<typeof RoutingConfigV3Schema>

// ─────────────────────────────────────────────────────────────────────────────
// Time Window Types (for scheduling and time-aware behavior)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Time stamp for window definitions.
 * Can be a simple hour (0-23) or an object with hour/minute.
 */
export const TimeWindowTimeStampSchema = z.union([
  z.number().describe('Hour of day (0-23)'),
  z.object({
    hour: z.number(),
    minute: z.number().optional().default(0),
  }),
])

export type TimeWindowTimeStamp = z.infer<typeof TimeWindowTimeStampSchema>

/**
 * Day of week for window definitions.
 */
export const TimeWindowDayOfWeekSchema = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
])

export type TimeWindowDayOfWeek = z.infer<typeof TimeWindowDayOfWeekSchema>

/**
 * A time window slot definition (e.g., 9am-5pm Monday-Friday).
 */
export const TimeWindowSlotAgentSchema = z.object({
  startTime: TimeWindowTimeStampSchema,
  endTime: TimeWindowTimeStampSchema,
  days: z.array(TimeWindowDayOfWeekSchema),
})

export type TimeWindowSlotAgent = z.infer<typeof TimeWindowSlotAgentSchema>

/**
 * Response mode for time window behavior.
 * - immediate: Normal immediate response
 * - ack_and_schedule: Brief ack now + schedule full response for later
 * - schedule_only: No immediate response, schedule everything for later
 */
export const ResponseModeSchema = z.enum([
  'immediate',
  'ack_and_schedule',
  'schedule_only',
])

export type ResponseMode = z.infer<typeof ResponseModeSchema>

/**
 * Behavior configuration for a time window.
 * Controls how the agent responds when a message arrives during this window.
 */
export const TimeWindowBehaviorSchema = z.object({
  /** How to handle responses in this window */
  responseMode: ResponseModeSchema,
  /** Prompt injection for this time context */
  prompt: z.string().optional().describe('Prompt injection for this time context'),
  /**
   * Window to schedule responses for (when responseMode is ack_and_schedule
   * or schedule_only). Defaults to `behavior.scheduling.defaults.timeWindow`.
   */
  scheduleFor: z.string().optional().describe('Window name to schedule responses for'),
})

export type TimeWindowBehavior = z.infer<typeof TimeWindowBehaviorSchema>

/**
 * A named time window policy.
 * Defines when the window is active and how the agent behaves during it.
 */
export const TimeWindowPolicySchema = z.object({
  /**
   * IANA timezone for the window (e.g., "Australia/Sydney"). Omit to use the
   * agent's `behavior.timezone`. May reference a setting with Liquid.
   */
  timezone: z
    .string()
    .optional()
    .describe('IANA timezone, e.g., "Australia/Sydney". Defaults to behavior.timezone'),
  /** Time slots when this window is active */
  windows: z.array(TimeWindowSlotAgentSchema),
  /** Behavior for this window (optional - defaults to immediate response) */
  behavior: TimeWindowBehaviorSchema.optional(),
})

export type TimeWindowPolicy = z.infer<typeof TimeWindowPolicySchema>

/**
 * Collection of named time window policies.
 * Keys are policy names (e.g., "business_hours", "after_work").
 */
export const TimeWindowPoliciesSchema = z.record(z.string(), TimeWindowPolicySchema)

export type TimeWindowPolicies = z.infer<typeof TimeWindowPoliciesSchema>

/**
 * Default time window behavior.
 * Applied when no defined window matches the current time.
 */
export const TimeWindowDefaultSchema = TimeWindowBehaviorSchema.describe(
  'Fallback behavior when no time window matches'
)

export type TimeWindowDefault = z.infer<typeof TimeWindowDefaultSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Response and Behavior Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Response behavior configuration
 *
 * Controls how agents send messages via explicit tool calls.
 * - Intermediate messages: Progress updates ("Checking the calendar...")
 * - Final message: Completes the user's request (always reserved)
 * - Scheduled messages: Future follow-ups
 */
export const ResponsesBehaviorConfigSchema = z.object({
  /**
   * Maximum immediate messages per agent run (acks, progress updates).
   * @default 1
   */
  maxImmediate: z.number().optional(),

  /**
   * Maximum scheduled messages per agent run (follow-ups via sendAt).
   * @default 2
   */
  maxScheduled: z.number().optional(),

  /**
   * Maximum intermediate messages per agent run.
   * Intermediate = progress updates, acknowledgments before task completion.
   * The final message slot is always reserved separately.
   * @deprecated Use maxImmediate instead. Read as `maxImmediate` (capped at 1)
   * when `maxImmediate` is unset.
   */
  maxIntermediate: z.number().optional(),

  /**
   * Whether a final message is required before the run completes.
   * If true and no final message is sent, the run fails.
   * @default true
   */
  requireFinal: z.boolean().optional(),

  /**
   * Whether the agent can schedule messages for future delivery.
   * Scheduled messages typically require approval.
   * @default false
   */
  allowSchedule: z.boolean().optional(),

  /**
   * Whether the agent may skip sending when no reply is warranted.
   * Platform injects silence rules and exposes system:message:skip.
   * An explicit skip satisfies requireFinal. Off by default.
   * @default false
   */
  allowSilent: z.boolean().optional(),

  /**
   * Strip em dashes, smart quotes and bullet leaders from outbound messages.
   * @deprecated Use `behavior.message`: `bullets: dash`, `dashes: comma` and
   * `plainPunctuation: true` together are what this switch did.
   * @default false
   */
  humanize: z.boolean().optional(),

  /**
   * Message splitting configuration.
   * @deprecated Not implemented — accepted but never applied at runtime.
   */
  messageSplitting: z
    .object({
      enabled: z.boolean(),
      prompt: z.string().optional(),
    })
    .optional()
    .describe('Not implemented'),

  /**
   * Response gate configuration.
   * Automatically detects acknowledgment messages and recommends skipping
   * responses when a scheduled follow-up already exists.
   */
  responseGate: z
    .object({
      /**
       * Whether the response gate is enabled.
       * When true, the platform evaluates incoming messages for acknowledgment
       * patterns and may recommend skipping a response if scheduled follow-ups exist.
       * @default true (when allowSilent is true)
       */
      enabled: z.boolean().optional(),

      /**
       * Whether to hard-block sends when gate recommends skip.
       * When true, system:message:send is blocked unless overrideGate is provided.
       * When false (default), returns an error encouraging skip but allows override.
       * @default false
       */
      strictMode: z.boolean().optional(),

      /**
       * Minimum confidence threshold for acknowledgment detection.
       * Only recommend skip when confidence meets this threshold.
       * @default 0.7
       */
      minAckConfidence: z.number().min(0).max(1).optional(),
    })
    .optional(),
})

export type ResponsesBehaviorConfig = z.infer<
  typeof ResponsesBehaviorConfigSchema
>

/**
 * How strongly the platform enforces one declared conversation rule.
 *
 * - `off` — not stated in the prompt and not checked at runtime
 * - `prompt` — stated as a rule; the agent is steered, never blocked
 * - `reject` — the send is rejected at runtime so the model rewrites it
 *
 * No level ends the run: a style rule must never cost the customer a reply.
 */
export const ConversationPolicyLevelSchema = z.enum(['off', 'prompt', 'reject'])

export type ConversationPolicyLevel = z.infer<
  typeof ConversationPolicyLevelSchema
>

/**
 * Conversational behavior the agent declares for itself.
 *
 * The runtime enforces mechanical invariants — arguments validate, declared
 * budgets hold, no duplicate payload, permissions route. Opinions about how a
 * conversation should go are not invariants: a sales qualifier wants a
 * discovery flow, a booking confirmation bot wants none. Declare them here so
 * the same runtime can serve both.
 *
 * Every key defaults to `prompt` except `oneQuestionPerMessage`, which
 * defaults to `off`. Set `off` for a direct agent that should just answer.
 */
export const ConversationBehaviorConfigSchema = z.object({
  /** Do not re-ask something the customer already answered. */
  repeatQuestions: ConversationPolicyLevelSchema.optional(),
  /** Do not send skill example wording verbatim. */
  exampleCopy: ConversationPolicyLevelSchema.optional(),
  /**
   * A named delay or a promised check-in should produce a scheduled send.
   * `prompt` reprompts once and accepts the turn either way; `reject` fails
   * the turn when no scheduled send follows.
   */
  namedDelayFollowUp: ConversationPolicyLevelSchema.optional(),
  /**
   * Keep the turn to one message. Prompt-only — the hard count comes from
   * `behavior.responses.maxImmediate`.
   * @deprecated Stated whenever `behavior.responses.maxImmediate` is 1.
   */
  oneMessagePerTurn: ConversationPolicyLevelSchema.optional(),
  /**
   * Skip rather than send filler. Prompt-only, and only stated when
   * `behavior.responses.allowSilent` is set.
   */
  fillerBan: ConversationPolicyLevelSchema.optional(),
  /**
   * A bare acknowledgement does not cancel a pending follow-up. Prompt-only,
   * and only stated when the thread has pending scheduled messages.
   */
  cancelPendingOnAck: ConversationPolicyLevelSchema.optional(),
  /**
   * Ask one thing at a time. `reject` blocks a send that asks more than one
   * question. Defaults to `off` at runtime: an agent that collects several
   * answers in one message is a legitimate design.
   * @deprecated Use `behavior.message.maxQuestions`, which always rejects.
   */
  oneQuestionPerMessage: ConversationPolicyLevelSchema.optional(),
  /**
   * Fallback when every send this turn was rejected by a policy gate.
   * `send` releases the last rejected message, `skip` records a skip.
   * @default "send"
   */
  onPolicyRejectExhausted: z.enum(['send', 'skip']).optional(),
})

export type ConversationBehaviorConfig = z.infer<
  typeof ConversationBehaviorConfigSchema
>

/**
 * Structured default delay for scheduling patterns.
 * Matches the sendAt format used in message tools.
 */
export const SchedulingDelaySchema = z.object({
  /** Time unit amount */
  amount: z.number(),
  /** Time unit (e.g., "week", "weeks", "day", "days", "month", "months") */
  unit: z.string(),
  /** Time window to constrain the delay. Defaults to `scheduling.defaults.timeWindow`. */
  timeWindow: z.string().optional(),
})

export type SchedulingDelay = z.infer<typeof SchedulingDelaySchema>

/**
 * Scheduling pattern configuration.
 * Defines when the agent should schedule follow-up messages.
 */
export const SchedulingPatternSchema = z.object({
  /** Trigger name for this pattern */
  trigger: z.string(),
  /** Human-readable description of when this pattern applies */
  description: z.string().optional(),
  /** Example user phrases that match this pattern */
  examples: z.array(z.string()).optional(),
  /** Default delay for this pattern */
  defaultDelay: SchedulingDelaySchema.optional(),
})

export type SchedulingPattern = z.infer<typeof SchedulingPatternSchema>

/**
 * Scheduling behavior configuration.
 * Controls when and how the agent schedules follow-up messages.
 */
export const SchedulingBehaviorConfigSchema = z.object({
  /**
   * Patterns that trigger scheduling suggestions.
   * The agent uses these to know when to add sendAt to messages.
   */
  patterns: z.array(SchedulingPatternSchema).optional(),

  /**
   * Default settings for scheduled messages.
   */
  defaults: z
    .object({
      /** Cancel scheduled message if user replies before send time (default: true) */
      cancelOnActivity: z.boolean().optional(),
      /**
       * Whether scheduled messages require approval.
       * @deprecated Use `policies.messages.schedule.requiresApproval`.
       */
      requiresApproval: z.boolean().optional(),
      /**
       * Default time window policy for scheduled messages. Window
       * `scheduleFor` and pattern `defaultDelay.timeWindow` inherit it.
       */
      timeWindow: z.string().optional().describe('Time window policy name for scheduled messages'),
    })
    .optional(),
})

export type SchedulingBehaviorConfig = z.infer<
  typeof SchedulingBehaviorConfigSchema
>

/**
 * Who the agent is. Both keys may reference settings with Liquid; a name that
 * renders blank means the agent gives itself no name.
 */
export const BehaviorPersonaV3Schema = z.object({
  /** Name the agent goes by, e.g. `"{{ STUDIO_MANAGER_NAME }}"`. */
  name: z.string().optional(),
  /** Voice and style the outbound text is rewritten in. */
  voice: z.string().optional(),
})

export type BehaviorPersonaV3 = z.infer<typeof BehaviorPersonaV3Schema>

/**
 * Rules every outbound message follows. Each rule is stated once in the
 * prompt and applied to the text before it is sent.
 */
export const MessageRulesV3Schema = z.object({
  /** Longest message in characters. Longer text is cut, keeping the question. */
  maxChars: z.number().int().positive().optional(),
  /** Most questions per message. A send that asks more is rejected and rewritten. */
  maxQuestions: z.number().int().positive().optional(),
  /**
   * `false` strips emojis.
   * @default true
   */
  emojis: z.boolean().optional(),
  /**
   * `false` strips a trailing sign-off line.
   * @default true
   */
  signOffs: z.boolean().optional(),
  /**
   * `keep` leaves bullets, `dash` turns bullet leaders into "- ", `strip`
   * removes them.
   * @default "keep"
   */
  bullets: z.enum(['keep', 'dash', 'strip']).optional(),
  /**
   * `keep` leaves em and en dashes, `comma` turns them into commas, `strip`
   * removes them.
   * @default "keep"
   */
  dashes: z.enum(['keep', 'comma', 'strip']).optional(),
  /**
   * Straight quotes, a three-dot ellipsis and no space before punctuation.
   * @default false
   */
  plainPunctuation: z.boolean().optional(),
})

export type MessageRulesV3 = z.infer<typeof MessageRulesV3Schema>

/** Mention a long gap since the last message when one has passed. */
export const TimeGapsV3Schema = z.object({
  /** @default false */
  acknowledge: z.boolean().optional(),
  /** Gap that counts as long, e.g. "3 days" or "7d". */
  threshold: z.string().optional(),
})

export type TimeGapsV3 = z.infer<typeof TimeGapsV3Schema>

/**
 * Behavior configuration for agent runtime behavior.
 * These settings control how the agent operates and responds.
 */
export const BehaviorConfigV3Schema = z.object({
  /**
   * Response behavior - controls message sending via tool calls.
   * When configured, agents must explicitly call system:message:send
   * instead of producing implicit final output.
   */
  responses: ResponsesBehaviorConfigSchema.optional(),

  /**
   * Scheduling behavior - controls when the agent schedules follow-up messages.
   * Patterns define triggers like "user indicates they'll return later".
   */
  scheduling: SchedulingBehaviorConfigSchema.optional(),

  /**
   * Conversation policy - which conversational rules this agent wants, and
   * whether each is stated in the prompt or enforced at runtime.
   */
  conversation: ConversationBehaviorConfigSchema.optional(),

  /**
   * Mention a long gap since the last message when one has passed.
   * @deprecated Use `behavior.timeGaps.acknowledge`.
   * @default false
   */
  acknowledgeTimeGaps: z.boolean().optional(),

  /**
   * Gap that counts as long for `acknowledgeTimeGaps`, e.g. "3 days".
   * @deprecated Use `behavior.timeGaps.threshold`.
   */
  timeGapThreshold: z.string().optional(),

  /**
   * IANA timezone for the agent's clock and for windows that omit one.
   * May reference a setting with Liquid, e.g. `"{{ STUDIO_TIMEZONE }}"`.
   */
  timezone: z.string().optional(),

  /** Who the agent is. Rewrites outbound text in this voice. */
  persona: BehaviorPersonaV3Schema.optional(),

  /** Rules every outbound message follows. */
  message: MessageRulesV3Schema.optional(),

  /** Mention a long gap since the last message. */
  timeGaps: TimeGapsV3Schema.optional(),

  /**
   * Named time window policies. Windows must not overlap. Replaces the
   * top-level `timeWindows`.
   */
  timeWindows: TimeWindowPoliciesSchema.optional(),

  /** Fallback when no window matches. Replaces the top-level `timeWindowDefault`. */
  timeWindowDefault: TimeWindowDefaultSchema.optional(),
})

export type BehaviorConfigV3 = z.infer<typeof BehaviorConfigV3Schema>

/**
 * An install-scoped value the agent asks for by key.
 *
 * The platform does not interpret the key. It prints the label and value for
 * the model and renders `guidance` when the install supplied a value, so what
 * a setting means stays the app's business.
 */
export const AgentSettingV3Schema = z.object({
  /**
   * Setting key, resolved against the install's AgentConfig and env. Liquid
   * templates reference it by this exact name.
   */
  key: z.string().min(1),
  /** Human label shown in the console and to the grader. */
  label: z.string().optional(),
  /** Value used when the install leaves the setting blank. */
  default: z.string().optional(),
  /**
   * Prompt guidance for this setting. `{{value}}` interpolates the install
   * value and `{{workplace}}` the workplace name.
   * @deprecated Reference the setting with Liquid in the prompt instead.
   */
  guidance: z.string().optional(),
  /**
   * Guidance printed when the install leaves the setting blank.
   * @deprecated Use `{% if KEY %}...{% else %}...{% endif %}` in the prompt.
   */
  emptyGuidance: z.string().optional(),
  /**
   * Marks a setting as supplying a platform value rather than prose.
   * `persona_name` overrides the agent's persona name for this install.
   * @deprecated Set `behavior.persona.name: "{{ KEY }}"`.
   */
  role: z.enum(['persona_name']).optional(),
})

export type AgentSettingV3 = z.infer<typeof AgentSettingV3Schema>

/**
 * Prompts configuration for agent-specific prompt injections.
 * These prompts are injected during specific runtime phases.
 */
export const PromptsConfigV3Schema = z.object({
  /** Main system prompt with workflow instructions */
  system: z.string().optional(),
  /**
   * Injected during second pass when skills were loaded but tools not used.
   * @deprecated Ignored on the durable turn path; only the legacy stream path
   * reads it. Put the guidance in `system` instead.
   */
  recovery: z.string().optional().describe('Not implemented'),
  /**
   * Injected during follow-up passes when context needs updating.
   * @deprecated Ignored on the durable turn path; only the legacy stream path
   * reads it. Put the guidance in `system` instead.
   */
  followUp: z.string().optional().describe('Not implemented'),
  /** Thread list title generation (system + user template with {{var}} placeholders) */
  titleEnrichment: z
    .object({
      system: z.string().optional(),
      user: z.string().optional(),
    })
    .optional(),
})

export type PromptsConfigV3 = z.infer<typeof PromptsConfigV3Schema>

/**
 * Event activation for an agent. `subscribes` and `condition` register the
 * agent's event subscriptions on deploy; the rest is not read for agents yet.
 */
export const AgentEventsConfigV3Schema = EventsConfigSchema.extend({
  emits: EventsConfigSchema.shape.emits.describe('Not implemented'),
  waits: EventsConfigSchema.shape.waits.describe('Not implemented'),
  cancels: EventsConfigSchema.shape.cancels.describe('Not implemented'),
  cancelCondition: EventsConfigSchema.shape.cancelCondition.describe('Not implemented'),
})

export type AgentEventsConfigV3 = z.infer<typeof AgentEventsConfigV3Schema>

/**
 * Full Agent YAML v3 Schema
 *
 * This schema removes stages and uses skills instead.
 * Agents subscribe to events and react autonomously.
 * 
 * Tool Ownership Model:
 * - Skills own their tools (defined in skill files with full config)
 * - Agents reference skills, not individual tools
 * - tools: Always-available tools before any skill loads (e.g., system:settings:business_information:get)
 */
export const AgentYAMLV3Schema = z.object({
  $schema: z.string().optional(),
  handle: z.string(),
  name: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),
  /** Copy for a public website. Not the persona or prompts. */
  public: PublicListingSchema.optional(),

  /**
   * Persona - Who the agent is.
   * @deprecated Use `behavior.persona` and `behavior.message`.
   */
  persona: PersonaV3Schema.optional(),

  // Skills - What the agent knows how to do (skills own their tools)
  skills: z.array(SkillRefSchema).optional(),

  // Tools - Always-available tools before any skill loads
  // Examples: system:settings:business_information:get
  tools: z.array(AgentToolRefSchema).optional(),

  /**
   * Settings - Install-scoped values the agent can reference by key.
   * Templates reference them with Liquid, e.g. `{{ STUDIO_MANAGER_NAME }}`.
   * Agents whose rows still carry `guidance`/`emptyGuidance`/`role` and use
   * no Liquid references keep the older auto-printed settings section.
   */
  settings: z.array(AgentSettingV3Schema).optional(),

  /**
   * Events - When the agent activates. `subscribes` registers the agent's
   * event subscriptions on deploy.
   */
  events: AgentEventsConfigV3Schema.optional(),

  /**
   * Memory - How the agent remembers
   * @deprecated Not yet implemented - this is a planned feature.
   * Fields are accepted but not used at runtime.
   */
  memory: MemoryConfigV3Schema.optional().describe('Not implemented'),

  // Policies - Business rules for the agent
  policies: PoliciesConfigV3Schema.optional(),

  // Runtime - Execution configuration (model + personaModel)
  runtime: RuntimeConfigV3Schema.optional(),

  // Routing - Harness picks the turn's skills before the main model runs
  routing: RoutingConfigV3Schema.optional(),

  // Prompts - Agent-specific prompt injections
  prompts: PromptsConfigV3Schema.optional(),

  // Behavior - Agent runtime behavior configuration
  // responses: Controls message sending via explicit tool calls
  behavior: BehaviorConfigV3Schema.optional(),

  /**
   * Named time window policies for scheduling constraints.
   * @deprecated Use `behavior.timeWindows`. Read when that is unset.
   */
  timeWindows: TimeWindowPoliciesSchema.optional(),

  /**
   * Fallback behavior when no window matches.
   * @deprecated Use `behavior.timeWindowDefault`. Read when that is unset.
   */
  timeWindowDefault: TimeWindowDefaultSchema.optional(),

  // Sandbox - Testing configuration
  sandbox: SandboxConfigSchema.optional(),
})

export type AgentYAMLV3 = z.infer<typeof AgentYAMLV3Schema>

/**
 * Helper function to define an agent with type safety
 */
export function defineAgentV3(agent: AgentYAMLV3): AgentYAMLV3 {
  return AgentYAMLV3Schema.parse(agent)
}

/**
 * Validate an agent YAML v3 object
 */
export function validateAgentYAMLV3(
  agent: unknown,
): { success: true; data: AgentYAMLV3 } | { success: false; error: z.ZodError } {
  const result = AgentYAMLV3Schema.safeParse(agent)
  if (!result.success) {
    return { success: false, error: result.error }
  }
  const routingIssues = validateAgentRouting(result.data)
  if (routingIssues.length > 0) {
    return {
      success: false,
      error: new z.ZodError(
        routingIssues.map((issue) => ({
          code: 'custom' as const,
          path: issue.path,
          message: issue.message,
          input: undefined,
        })),
      ),
    }
  }
  return { success: true, data: result.data }
}

export interface AgentRoutingIssue {
  path: (string | number)[]
  message: string
}

function skillRefHandle(ref: SkillRef): string {
  return typeof ref === 'string' ? ref : ref.skill
}

/**
 * Cross-field checks for `routing`. `fallback` may only name declared skills,
 * and an enabled router needs at least one skill to choose from.
 */
export function validateAgentRouting(
  agent: Pick<AgentYAMLV3, 'routing' | 'skills'>,
): AgentRoutingIssue[] {
  const routing = agent.routing
  if (!routing) return []
  const issues: AgentRoutingIssue[] = []
  const declared = new Set((agent.skills ?? []).map(skillRefHandle))

  if (routing.enabled && declared.size === 0) {
    issues.push({
      path: ['routing', 'enabled'],
      message: 'routing.enabled needs at least one entry in skills',
    })
  }

  for (const [index, handle] of (routing.fallback ?? []).entries()) {
    if (!declared.has(handle)) {
      issues.push({
        path: ['routing', 'fallback', index],
        message: `routing.fallback names "${handle}", which is not in skills`,
      })
    }
  }

  return issues
}
