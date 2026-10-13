import { z } from 'zod/v4'
import { EventsConfigSchema } from '../events/types'
import { SkillRefSchema } from '../skills/types'
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
})

export type RuntimeConfigV3 = z.infer<typeof RuntimeConfigV3Schema>

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
  /** Window to schedule responses for (when responseMode is ack_and_schedule or schedule_only) */
  scheduleFor: z.string().optional().describe('Window name to schedule responses for'),
})

export type TimeWindowBehavior = z.infer<typeof TimeWindowBehaviorSchema>

/**
 * A named time window policy.
 * Defines when the window is active and how the agent behaves during it.
 */
export const TimeWindowPolicySchema = z.object({
  /** IANA timezone for the window (e.g., "Australia/Sydney") */
  timezone: z.string().describe('IANA timezone, e.g., "Australia/Sydney"'),
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
   * @deprecated Use maxImmediate instead
   * @default 2
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
  /** Optional time window to constrain the delay */
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
      /** Whether scheduled messages require approval (default: true) */
      requiresApproval: z.boolean().optional(),
      /** Default time window policy to constrain all scheduled messages */
      timeWindow: z.string().optional().describe('Time window policy name for scheduled messages'),
    })
    .optional(),
})

export type SchedulingBehaviorConfig = z.infer<
  typeof SchedulingBehaviorConfigSchema
>

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
   * @default false
   */
  acknowledgeTimeGaps: z.boolean().optional(),

  /**
   * Gap that counts as long for `acknowledgeTimeGaps`, e.g. "3 days".
   */
  timeGapThreshold: z.string().optional(),
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
  /** Setting key, resolved against the install's AgentConfig and env. */
  key: z.string().min(1),
  /** Human label shown to the model and in the console. */
  label: z.string().optional(),
  /**
   * Prompt guidance for this setting. `{{value}}` interpolates the install
   * value and `{{workplace}}` the workplace name.
   */
  guidance: z.string().optional(),
  /**
   * Marks a setting as supplying a platform value rather than prose.
   * `persona_name` overrides the agent's persona name for this install.
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

  // Persona - Who the agent is
  persona: PersonaV3Schema.optional(),

  // Skills - What the agent knows how to do (skills own their tools)
  skills: z.array(SkillRefSchema).optional(),

  // Tools - Always-available tools before any skill loads
  // Examples: system:settings:business_information:get
  tools: z.array(AgentToolRefSchema).optional(),

  /**
   * Settings - Install-scoped values the agent asks for by key.
   * Rendered into the prompt with the label and guidance declared here.
   */
  settings: z.array(AgentSettingV3Schema).optional(),

  /**
   * Events - When the agent activates
   * @deprecated Not yet implemented - this is a planned feature for event-driven agents.
   * Fields are accepted but not used at runtime.
   */
  events: EventsConfigSchema.optional().describe('Not implemented'),

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

  // Prompts - Agent-specific prompt injections
  prompts: PromptsConfigV3Schema.optional(),

  // Behavior - Agent runtime behavior configuration
  // responses: Controls message sending via explicit tool calls
  behavior: BehaviorConfigV3Schema.optional(),

  // Time Windows - Named time window policies for scheduling constraints
  // Windows must be mutually exclusive (non-overlapping)
  // Each window can define its own behavior (response mode, prompt, etc.)
  timeWindows: TimeWindowPoliciesSchema.optional(),

  // Time Window Default - Fallback behavior when no window matches
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
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error }
}
