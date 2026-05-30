/**
 * Workflow-Safe Scheduling Types
 *
 * These types are plain TypeScript interfaces without zod dependencies.
 * They can be safely imported in Temporal workflow code.
 *
 * Note: The zod schemas in types.ts are the source of truth for validation.
 * These interfaces mirror them for workflow use.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Time Stamp Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TimeStamp can be either:
 * - A number representing hour of day (0-23)
 * - An object with hour, minute, second (minute and second default to 0 in parsing)
 *
 * Note: After zod parsing, minute and second are always numbers (defaulted to 0).
 * For workflow input, you can omit them but the resolved type expects numbers.
 */
export type TimeStamp = number | { hour: number; minute: number; second: number }

// ─────────────────────────────────────────────────────────────────────────────
// Day of Week
// ─────────────────────────────────────────────────────────────────────────────

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

// ─────────────────────────────────────────────────────────────────────────────
// Time Window Slot
// ─────────────────────────────────────────────────────────────────────────────

export interface TimeWindowSlot {
  startTime: TimeStamp
  endTime: TimeStamp
  days: DayOfWeek[]
  timezone?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Wait Input Types (for calculateWaitTime)
// ─────────────────────────────────────────────────────────────────────────────

export type WaitUnit =
  | 'second'
  | 'seconds'
  | 'minute'
  | 'minutes'
  | 'hour'
  | 'hours'
  | 'day'
  | 'days'
  | 'week'
  | 'weeks'
  | 'month'
  | 'months'
  | 'year'
  | 'years'

export interface WaitInputRelative {
  mode: 'relative'
  amount: number
  unit: WaitUnit
  windows?: TimeWindowSlot[]
}

export interface WaitInputAbsolute {
  mode: 'absolute'
  scheduleAt: string | number
}

export type WaitInputType = WaitInputRelative | WaitInputAbsolute

// ─────────────────────────────────────────────────────────────────────────────
// Calculate Wait Time Result
// ─────────────────────────────────────────────────────────────────────────────

export interface CalculateWaitTimeResult {
  waitTime: number
  scheduledAt: Date
}

// ─────────────────────────────────────────────────────────────────────────────
// Time Window Policy (for isTimeInPolicy)
// ─────────────────────────────────────────────────────────────────────────────

export interface TimeWindowPolicy {
  timezone: string
  windows: TimeWindowSlot[]
  behavior?: {
    responseMode?: 'immediate' | 'ack_and_schedule' | 'schedule_only'
    prompt?: string
    scheduleFor?: string
  }
}
