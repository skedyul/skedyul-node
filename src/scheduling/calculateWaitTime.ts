/**
 * Calculate Wait Time
 *
 * Calculates when to schedule a message or wait step based on relative/absolute time
 * and optional time window constraints.
 *
 * This is the source of truth - skedyul-core re-exports for backward compatibility.
 */

import type {
  WaitInputType,
  TimeStamp,
  TimeWindowSlot,
  CalculateWaitTimeResult,
} from './types-workflow'

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
 * Extract hour from a TimeStamp
 */
function getHourFromTimeStamp(timeStamp: TimeStamp): number {
  if (timeStamp === undefined || timeStamp === null) {
    throw new Error('timeStamp is required and cannot be undefined or null')
  }
  if (typeof timeStamp === 'number') {
    return timeStamp
  }
  return timeStamp.hour
}

/**
 * Extract minute from a TimeStamp
 */
function getMinuteFromTimeStamp(timeStamp: TimeStamp): number {
  if (timeStamp === undefined || timeStamp === null) {
    throw new Error('timeStamp is required and cannot be undefined or null')
  }
  if (typeof timeStamp === 'number') {
    return 0 // Default to 0 minutes if only hour is specified
  }
  return timeStamp.minute ?? 0
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
 * Check if a date falls within a specific time window
 */
function isTimeInWindowSlot(date: Date, window: TimeWindowSlot): boolean {
  if (!window || window.startTime === undefined || window.endTime === undefined) {
    return false
  }

  const {
    days: daysOfWeek,
    startTime: windowStartTime,
    endTime: windowEndTime,
    timezone,
  } = window

  // Use provided timezone or default to UTC
  const tz = timezone ?? 'UTC'

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
 * Calculate the wait time for a wait step
 * @param step The input parameters for the wait step
 * @param now The current date/time
 * @returns The time to wait in milliseconds and the scheduled date
 */
export function calculateWaitTime(
  step: WaitInputType,
  now: Date,
): CalculateWaitTimeResult {
  const nowTime = now.getTime()

  switch (step.mode) {
    case 'absolute': {
      // Return the difference between the target timestamp and now in milliseconds
      const scheduleAtTime =
        typeof step.scheduleAt === 'string'
          ? new Date(step.scheduleAt).getTime()
          : step.scheduleAt

      return {
        waitTime: Math.max(0, scheduleAtTime - nowTime),
        scheduledAt: new Date(scheduleAtTime),
      }
    }

    case 'relative': {
      // If no arguments provided, execute immediately
      if (!step.amount && (!step.windows || step.windows.length === 0)) {
        return {
          waitTime: 0,
          scheduledAt: now,
        }
      }

      // Calculate relative delay if amount is provided
      let relativeDelay = 0
      if (step.amount && step.unit) {
        switch (step.unit) {
          case 'seconds':
          case 'second':
            relativeDelay = step.amount * 1000
            break
          case 'minutes':
          case 'minute':
            relativeDelay = step.amount * 60 * 1000
            break
          case 'hours':
          case 'hour':
            relativeDelay = step.amount * 60 * 60 * 1000
            break
          case 'days':
          case 'day':
            relativeDelay = step.amount * 24 * 60 * 60 * 1000
            break
          case 'weeks':
          case 'week':
            relativeDelay = step.amount * 7 * 24 * 60 * 60 * 1000
            break
          case 'months':
          case 'month': {
            // Approximate months as 30 days
            relativeDelay = step.amount * 30 * 24 * 60 * 60 * 1000
            break
          }
          case 'years':
          case 'year': {
            // Approximate years as 365 days
            relativeDelay = step.amount * 365 * 24 * 60 * 60 * 1000
            break
          }
        }
      }

      // If no windows specified, just return the relative delay
      if (!step.windows || step.windows.length === 0) {
        return {
          waitTime: relativeDelay,
          scheduledAt: new Date(nowTime + relativeDelay),
        }
      }

      // Check if the target time (now + relative delay) falls within ANY window
      const targetDate = new Date(nowTime + relativeDelay)

      // Check if target time falls within any window
      for (const window of step.windows) {
        if (isTimeInWindowSlot(targetDate, window)) {
          // Target is already in an allowed window, use relative delay
          return {
            waitTime: relativeDelay,
            scheduledAt: new Date(nowTime + relativeDelay),
          }
        }
      }

      // Target time doesn't fall in any window, find the next available window.
      // Preserve relativeDelay offset from window start so cadence messages stay spaced apart.
      let earliestScheduledTime: Date | null = null
      let earliestWaitFromNow = Infinity

      for (const window of step.windows) {
        if (!window || window.startTime === undefined || window.endTime === undefined) {
          continue
        }

        const { days: daysOfWeek, startTime: windowStartTime, timezone } = window

        // Use provided timezone or default to UTC
        const tz = timezone ?? 'UTC'

        // Normalize start time to minutes from start of day
        const windowStartMinutes = normalizeTimeToMinutes(windowStartTime)

        // Extract hour and minute components for comparisons
        const windowStartHour = getHourFromTimeStamp(windowStartTime)
        const windowStartMinute = getMinuteFromTimeStamp(windowStartTime)

        // Parse allowed days to numbers
        const allowedDays = daysOfWeek
          .map((day: string) => {
            return dayNameToNumber[day.toLowerCase()] ?? parseInt(day)
          })
          .filter((day: number) => !isNaN(day) && day >= 0 && day <= 6)

        // Get the target day and time in the target timezone (relative to targetDate)
        const targetTzInfo = getTimezoneInfo(targetDate, tz)
        const currentDay = targetTzInfo.day
        const currentHour = targetTzInfo.hour
        const currentMinute = targetTzInfo.minute
        const currentTotalMinutes = targetTzInfo.totalMinutes

        let msUntilWindowStart: number

        // Check if we can schedule for today
        if (
          allowedDays.includes(currentDay) &&
          currentTotalMinutes < windowStartMinutes
        ) {
          // Target is before today's window — wait until window opens
          const minutesUntilWindow = windowStartMinutes - currentTotalMinutes
          msUntilWindowStart = minutesUntilWindow * 60 * 1000
        } else {
          // Find the next allowed day for this window
          let daysToAdd = 7

          // Check each day starting from tomorrow
          for (let i = 1; i <= 7; i++) {
            const nextDay = (currentDay + i) % 7
            if (allowedDays.includes(nextDay)) {
              daysToAdd = i
              break
            }
          }

          // Calculate total wait time for this window
          const millisecondsPerDay = 24 * 60 * 60 * 1000
          const millisecondsPerHour = 60 * 60 * 1000
          const millisecondsPerMinute = 60 * 1000

          const daysMs = daysToAdd * millisecondsPerDay
          const hoursAdjustment =
            (windowStartHour - currentHour) * millisecondsPerHour
          const minutesAdjustment =
            (windowStartMinute - currentMinute) * millisecondsPerMinute

          msUntilWindowStart = daysMs + hoursAdjustment + minutesAdjustment
        }

        // Schedule at window start + relativeDelay to preserve cadence spacing
        const windowStartTimeMs = targetDate.getTime() + msUntilWindowStart
        const windowScheduledTime = new Date(windowStartTimeMs + relativeDelay)
        const waitFromNow = windowScheduledTime.getTime() - nowTime

        // Pick the window that yields the earliest final scheduled time
        if (waitFromNow < earliestWaitFromNow) {
          earliestWaitFromNow = waitFromNow
          earliestScheduledTime = windowScheduledTime
        }
      }

      if (earliestScheduledTime) {
        return {
          waitTime: Math.max(0, earliestScheduledTime.getTime() - nowTime),
          scheduledAt: earliestScheduledTime,
        }
      }

      // Fallback to first window if no valid windows found (should not happen with valid input)
      throw new Error('No valid time windows found for scheduling')
    }

    default:
      throw new Error(`Unsupported wait mode: ${(step as any).mode}`)
  }
}
