/**
 * Scheduling Types
 *
 * Time window and scheduling types used for agent scheduling and workflow waits.
 * This is the source of truth - skedyul-core re-exports these for backward compatibility.
 */

import { z } from 'zod/v4'

// ─────────────────────────────────────────────────────────────────────────────
// Time Stamp Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TimeStamp can be either:
 * - A number representing hour of day (0-23)
 * - An object with hour, minute, second
 */
export const TimeStampSchema = z.union([
  z.number().describe('Hour of day (0-23)'),
  z.object({
    hour: z.number(),
    minute: z.number().optional().default(0),
    second: z.number().optional().default(0),
  }),
])

export type TimeStamp = z.infer<typeof TimeStampSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Day of Week
// ─────────────────────────────────────────────────────────────────────────────

export const DayOfWeekSchema = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
])

export type DayOfWeek = z.infer<typeof DayOfWeekSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Time Window Slot
// ─────────────────────────────────────────────────────────────────────────────

export const TimeWindowSlotSchema = z.object({
  startTime: TimeStampSchema,
  endTime: TimeStampSchema,
  days: z.array(DayOfWeekSchema),
  timezone: z.string().optional(),
})

export type TimeWindowSlot = z.infer<typeof TimeWindowSlotSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Wait Input Types (for calculateWaitTime)
// ─────────────────────────────────────────────────────────────────────────────

export const WaitUnitSchema = z.enum([
  'second',
  'seconds',
  'minute',
  'minutes',
  'hour',
  'hours',
  'day',
  'days',
  'week',
  'weeks',
  'month',
  'months',
  'year',
  'years',
])

export type WaitUnit = z.infer<typeof WaitUnitSchema>

export const WaitInputRelativeSchema = z.object({
  mode: z.literal('relative'),
  amount: z.number(),
  unit: WaitUnitSchema,
  windows: z.array(TimeWindowSlotSchema).optional(),
})

export const WaitInputAbsoluteSchema = z.object({
  mode: z.literal('absolute'),
  scheduleAt: z.union([z.string(), z.number()]),
})

export const WaitInputSchema = z.union([
  WaitInputRelativeSchema,
  WaitInputAbsoluteSchema,
])

export type WaitInputRelative = z.infer<typeof WaitInputRelativeSchema>
export type WaitInputAbsolute = z.infer<typeof WaitInputAbsoluteSchema>
export type WaitInputType = z.infer<typeof WaitInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Calculate Wait Time Result
// ─────────────────────────────────────────────────────────────────────────────

export interface CalculateWaitTimeResult {
  waitTime: number
  scheduledAt: Date
}
