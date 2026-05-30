/**
 * Time Window Detection
 *
 * Helper functions to check if a given time falls within a time window policy.
 * Used for detecting the current time context (business hours, after hours, etc.)
 */

import type { TimeStamp, TimeWindowSlot, TimeWindowPolicy } from './types-workflow'

// Map day names to day numbers (0-6, where 0 = Sunday)
const dayNameToNumber: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

/**
 * Normalize a TimeStamp to total minutes from start of day
 */
function normalizeTimeToMinutes(timeStamp: TimeStamp): number {
  if (timeStamp === undefined || timeStamp === null) {
    throw new Error('timeStamp is required and cannot be undefined or null')
  }
  if (typeof timeStamp === 'number') {
    return timeStamp * 60 // Convert hours to minutes
  }
  const minute = timeStamp.minute ?? 0
  const second = timeStamp.second ?? 0
  return timeStamp.hour * 60 + minute + Math.floor(second / 60)
}

/**
 * Get timezone info for a date
 */
function getTimezoneInfo(
  date: Date,
  timezone: string,
): {
  day: number
  hour: number
  minute: number
  totalMinutes: number
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const partsObj = parts.reduce(
    (acc, part) => {
      acc[part.type] = part.value
      return acc
    },
    {} as Record<string, string>,
  )
  return {
    day: new Date(
      parseInt(partsObj.year ?? '0'),
      parseInt(partsObj.month ?? '1') - 1,
      parseInt(partsObj.day ?? '1'),
    ).getDay(),
    hour: parseInt(partsObj.hour ?? '0'),
    minute: parseInt(partsObj.minute ?? '0'),
    totalMinutes:
      parseInt(partsObj.hour ?? '0') * 60 + parseInt(partsObj.minute ?? '0'),
  }
}

/**
 * Check if a date falls within a specific time window slot
 */
export function isTimeInWindowSlot(
  date: Date,
  slot: TimeWindowSlot,
  timezone?: string,
): boolean {
  if (!slot || slot.startTime === undefined || slot.endTime === undefined) {
    return false
  }

  const {
    days: daysOfWeek,
    startTime: windowStartTime,
    endTime: windowEndTime,
  } = slot

  // Use provided timezone, slot timezone, or default to UTC
  const tz = timezone ?? slot.timezone ?? 'UTC'

  // Normalize start and end times to minutes from start of day
  const windowStartMinutes = normalizeTimeToMinutes(windowStartTime)
  const windowEndMinutes = normalizeTimeToMinutes(windowEndTime)

  // Parse allowed days to numbers
  const allowedDays = daysOfWeek
    .map((day: string) => {
      return dayNameToNumber[day.toLowerCase()] ?? parseInt(day)
    })
    .filter((day: number) => !isNaN(day) && day >= 0 && day <= 6)

  const tzInfo = getTimezoneInfo(date, tz)

  return (
    allowedDays.includes(tzInfo.day) &&
    tzInfo.totalMinutes >= windowStartMinutes &&
    tzInfo.totalMinutes < windowEndMinutes
  )
}

/**
 * Check if a date falls within any slot of a time window policy
 */
export function isTimeInPolicy(
  date: Date,
  policy: TimeWindowPolicy,
): boolean {
  if (!policy || !policy.windows || policy.windows.length === 0) {
    return false
  }

  // Check if the date falls within any of the policy's window slots
  for (const slot of policy.windows) {
    // Use policy-level timezone if slot doesn't have one
    const slotWithTimezone: TimeWindowSlot = {
      ...slot,
      timezone: slot.timezone ?? policy.timezone,
    }
    if (isTimeInWindowSlot(date, slotWithTimezone, policy.timezone)) {
      return true
    }
  }

  return false
}
