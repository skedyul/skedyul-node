"use strict";
/**
 * Calculate Wait Time
 *
 * Calculates when to schedule a message or wait step based on relative/absolute time
 * and optional time window constraints.
 *
 * This is the source of truth - skedyul-core re-exports for backward compatibility.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateWaitTime = calculateWaitTime;
// Map day names to day numbers (0-6, where 0 = Sunday)
const dayNameToNumber = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
};
/**
 * Normalize a TimeStamp to total minutes from start of day
 */
function normalizeTimeToMinutes(timeStamp) {
    if (timeStamp === undefined || timeStamp === null) {
        throw new Error('timeStamp is required and cannot be undefined or null');
    }
    if (typeof timeStamp === 'number') {
        return timeStamp * 60; // Convert hours to minutes
    }
    const minute = timeStamp.minute ?? 0;
    const second = timeStamp.second ?? 0;
    return timeStamp.hour * 60 + minute + Math.floor(second / 60);
}
/**
 * Extract hour from a TimeStamp
 */
function getHourFromTimeStamp(timeStamp) {
    if (timeStamp === undefined || timeStamp === null) {
        throw new Error('timeStamp is required and cannot be undefined or null');
    }
    if (typeof timeStamp === 'number') {
        return timeStamp;
    }
    return timeStamp.hour;
}
/**
 * Extract minute from a TimeStamp
 */
function getMinuteFromTimeStamp(timeStamp) {
    if (timeStamp === undefined || timeStamp === null) {
        throw new Error('timeStamp is required and cannot be undefined or null');
    }
    if (typeof timeStamp === 'number') {
        return 0; // Default to 0 minutes if only hour is specified
    }
    return timeStamp.minute ?? 0;
}
/**
 * Get timezone info for a date
 */
function getTimezoneInfo(date, timezone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const partsObj = parts.reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});
    return {
        day: new Date(parseInt(partsObj.year ?? '0'), parseInt(partsObj.month ?? '1') - 1, parseInt(partsObj.day ?? '1')).getDay(),
        hour: parseInt(partsObj.hour ?? '0'),
        minute: parseInt(partsObj.minute ?? '0'),
        totalMinutes: parseInt(partsObj.hour ?? '0') * 60 + parseInt(partsObj.minute ?? '0'),
    };
}
/**
 * Check if a date falls within a specific time window
 */
function isTimeInWindowSlot(date, window) {
    if (!window || window.startTime === undefined || window.endTime === undefined) {
        return false;
    }
    const { days: daysOfWeek, startTime: windowStartTime, endTime: windowEndTime, timezone, } = window;
    // Use provided timezone or default to UTC
    const tz = timezone ?? 'UTC';
    // Normalize start and end times to minutes from start of day
    const windowStartMinutes = normalizeTimeToMinutes(windowStartTime);
    const windowEndMinutes = normalizeTimeToMinutes(windowEndTime);
    // Parse allowed days to numbers
    const allowedDays = daysOfWeek
        .map((day) => {
        return dayNameToNumber[day.toLowerCase()] ?? parseInt(day);
    })
        .filter((day) => !isNaN(day) && day >= 0 && day <= 6);
    const tzInfo = getTimezoneInfo(date, tz);
    return (allowedDays.includes(tzInfo.day) &&
        tzInfo.totalMinutes >= windowStartMinutes &&
        tzInfo.totalMinutes < windowEndMinutes);
}
/**
 * Calculate the wait time for a wait step
 * @param step The input parameters for the wait step
 * @param now The current date/time
 * @returns The time to wait in milliseconds and the scheduled date
 */
function calculateWaitTime(step, now) {
    const nowTime = now.getTime();
    switch (step.mode) {
        case 'absolute': {
            // Return the difference between the target timestamp and now in milliseconds
            const scheduleAtTime = typeof step.scheduleAt === 'string'
                ? new Date(step.scheduleAt).getTime()
                : step.scheduleAt;
            return {
                waitTime: Math.max(0, scheduleAtTime - nowTime),
                scheduledAt: new Date(scheduleAtTime),
            };
        }
        case 'relative': {
            // If no arguments provided, execute immediately
            if (!step.amount && (!step.windows || step.windows.length === 0)) {
                return {
                    waitTime: 0,
                    scheduledAt: now,
                };
            }
            // Calculate relative delay if amount is provided
            let relativeDelay = 0;
            if (step.amount && step.unit) {
                switch (step.unit) {
                    case 'seconds':
                    case 'second':
                        relativeDelay = step.amount * 1000;
                        break;
                    case 'minutes':
                    case 'minute':
                        relativeDelay = step.amount * 60 * 1000;
                        break;
                    case 'hours':
                    case 'hour':
                        relativeDelay = step.amount * 60 * 60 * 1000;
                        break;
                    case 'days':
                    case 'day':
                        relativeDelay = step.amount * 24 * 60 * 60 * 1000;
                        break;
                    case 'weeks':
                    case 'week':
                        relativeDelay = step.amount * 7 * 24 * 60 * 60 * 1000;
                        break;
                    case 'months':
                    case 'month': {
                        // Approximate months as 30 days
                        relativeDelay = step.amount * 30 * 24 * 60 * 60 * 1000;
                        break;
                    }
                    case 'years':
                    case 'year': {
                        // Approximate years as 365 days
                        relativeDelay = step.amount * 365 * 24 * 60 * 60 * 1000;
                        break;
                    }
                }
            }
            // If no windows specified, just return the relative delay
            if (!step.windows || step.windows.length === 0) {
                return {
                    waitTime: relativeDelay,
                    scheduledAt: new Date(nowTime + relativeDelay),
                };
            }
            // Check if the target time (now + relative delay) falls within ANY window
            const targetDate = new Date(nowTime + relativeDelay);
            // Check if target time falls within any window
            for (const window of step.windows) {
                if (isTimeInWindowSlot(targetDate, window)) {
                    // Target is already in an allowed window, use relative delay
                    return {
                        waitTime: relativeDelay,
                        scheduledAt: new Date(nowTime + relativeDelay),
                    };
                }
            }
            // Target time doesn't fall in any window, find the next available window
            // Find the earliest next available window across ALL windows, relative to targetDate
            let earliestScheduledTime = null;
            let earliestWaitTime = Infinity;
            for (const window of step.windows) {
                if (!window || window.startTime === undefined || window.endTime === undefined) {
                    continue;
                }
                const { days: daysOfWeek, startTime: windowStartTime, timezone } = window;
                // Use provided timezone or default to UTC
                const tz = timezone ?? 'UTC';
                // Normalize start time to minutes from start of day
                const windowStartMinutes = normalizeTimeToMinutes(windowStartTime);
                // Extract hour and minute components for comparisons
                const windowStartHour = getHourFromTimeStamp(windowStartTime);
                const windowStartMinute = getMinuteFromTimeStamp(windowStartTime);
                // Parse allowed days to numbers
                const allowedDays = daysOfWeek
                    .map((day) => {
                    return dayNameToNumber[day.toLowerCase()] ?? parseInt(day);
                })
                    .filter((day) => !isNaN(day) && day >= 0 && day <= 6);
                // Get the target day and time in the target timezone (relative to targetDate)
                const targetTzInfo = getTimezoneInfo(targetDate, tz);
                const currentDay = targetTzInfo.day;
                const currentHour = targetTzInfo.hour;
                const currentMinute = targetTzInfo.minute;
                const currentTotalMinutes = targetTzInfo.totalMinutes;
                let windowWaitTime;
                let windowScheduledTime;
                // Check if we can schedule for today
                if (allowedDays.includes(currentDay) &&
                    currentTotalMinutes < windowStartMinutes) {
                    // Calculate milliseconds until window starts today
                    const minutesUntilWindow = windowStartMinutes - currentTotalMinutes;
                    windowWaitTime = minutesUntilWindow * 60 * 1000;
                    windowScheduledTime = new Date(targetDate.getTime() + windowWaitTime);
                }
                else {
                    // Find the next allowed day for this window
                    let daysToAdd = 1;
                    // Check each day starting from tomorrow
                    for (let i = 1; i <= 7; i++) {
                        const nextDay = (currentDay + i) % 7;
                        if (allowedDays.includes(nextDay)) {
                            daysToAdd = i;
                            break;
                        }
                    }
                    // Calculate total wait time for this window
                    const millisecondsPerDay = 24 * 60 * 60 * 1000;
                    const millisecondsPerHour = 60 * 60 * 1000;
                    const millisecondsPerMinute = 60 * 1000;
                    const daysMs = daysToAdd * millisecondsPerDay;
                    const hoursAdjustment = (windowStartHour - currentHour) * millisecondsPerHour;
                    const minutesAdjustment = (windowStartMinute - currentMinute) * millisecondsPerMinute;
                    windowWaitTime = daysMs + hoursAdjustment + minutesAdjustment;
                    windowScheduledTime = new Date(targetDate.getTime() + windowWaitTime);
                }
                // Check if this window has the earliest scheduled time
                if (windowWaitTime < earliestWaitTime) {
                    earliestWaitTime = windowWaitTime;
                    earliestScheduledTime = windowScheduledTime;
                }
            }
            // Return the earliest found window measured from targetDate (now + relativeDelay)
            if (earliestScheduledTime) {
                return {
                    waitTime: relativeDelay + earliestWaitTime,
                    scheduledAt: earliestScheduledTime,
                };
            }
            // Fallback to first window if no valid windows found (should not happen with valid input)
            throw new Error('No valid time windows found for scheduling');
        }
        default:
            throw new Error(`Unsupported wait mode: ${step.mode}`);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FsY3VsYXRlV2FpdFRpbWUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjYWxjdWxhdGVXYWl0VGltZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7R0FPRzs7QUFxSkgsOENBNExDO0FBeFVELHVEQUF1RDtBQUN2RCxNQUFNLGVBQWUsR0FBMkI7SUFDOUMsTUFBTSxFQUFFLENBQUM7SUFDVCxNQUFNLEVBQUUsQ0FBQztJQUNULE9BQU8sRUFBRSxDQUFDO0lBQ1YsU0FBUyxFQUFFLENBQUM7SUFDWixRQUFRLEVBQUUsQ0FBQztJQUNYLE1BQU0sRUFBRSxDQUFDO0lBQ1QsUUFBUSxFQUFFLENBQUM7Q0FDWixDQUFBO0FBRUQ7O0dBRUc7QUFDSCxTQUFTLHNCQUFzQixDQUFDLFNBQW9CO0lBQ2xELElBQUksU0FBUyxLQUFLLFNBQVMsSUFBSSxTQUFTLEtBQUssSUFBSSxFQUFFLENBQUM7UUFDbEQsTUFBTSxJQUFJLEtBQUssQ0FBQyx1REFBdUQsQ0FBQyxDQUFBO0lBQzFFLENBQUM7SUFDRCxJQUFJLE9BQU8sU0FBUyxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQ2xDLE9BQU8sU0FBUyxHQUFHLEVBQUUsQ0FBQSxDQUFDLDJCQUEyQjtJQUNuRCxDQUFDO0lBQ0QsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUE7SUFDcEMsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUE7SUFDcEMsT0FBTyxTQUFTLENBQUMsSUFBSSxHQUFHLEVBQUUsR0FBRyxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsRUFBRSxDQUFDLENBQUE7QUFDL0QsQ0FBQztBQUVEOztHQUVHO0FBQ0gsU0FBUyxvQkFBb0IsQ0FBQyxTQUFvQjtJQUNoRCxJQUFJLFNBQVMsS0FBSyxTQUFTLElBQUksU0FBUyxLQUFLLElBQUksRUFBRSxDQUFDO1FBQ2xELE1BQU0sSUFBSSxLQUFL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QyxDQUFBO1FBQy9ELENBQUM7UUFFRDtZQUNFLE1BQU0sSUFBSSxLQUFLLENBQUMsMEJBQTJCLElBQVksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFBO0lBQ25FLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBDYWxjdWxhdGUgV2FpdCBUaW1lXG4gKlxuICogQ2FsY3VsYXRlcyB3aGVuIHRvIHNjaGVkdWxlIGEgbWVzc2FnZSBvciB3YWl0IHN0ZXAgYmFzZWQgb24gcmVsYXRpdmUvYWJzb2x1dGUgdGltZVxuICogYW5kIG9wdGlvbmFsIHRpbWUgd2luZG93IGNvbnN0cmFpbnRzLlxuICpcbiAqIFRoaXMgaXMgdGhlIHNvdXJjZSBvZiB0cnV0aCAtIHNrZWR5dWwtY29yZSByZS1leHBvcnRzIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5LlxuICovXG5cbmltcG9ydCB0eXBlIHtcbiAgV2FpdElucHV0VHlwZSxcbiAgVGltZVN0YW1wLFxuICBUaW1lV2luZG93U2xvdCxcbiAgQ2FsY3VsYXRlV2FpdFRpbWVSZXN1bHQsXG59IGZyb20gJy4vdHlwZXMtd29ya2Zsb3cnXG5cbi8vIE1hcCBkYXkgbmFtZXMgdG8gZGF5IG51bWJlcnMgKDAtNiwgd2hlcmUgMCA9IFN1bmRheSlcbmNvbnN0IGRheU5hbWVUb051bWJlcjogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHtcbiAgc3VuZGF5OiAwLFxuICBtb25kYXk6IDEsXG4gIHR1ZXNkYXk6IDIsXG4gIHdlZG5lc2RheTogMyxcbiAgdGh1cnNkYXk6IDQsXG4gIGZyaWRheTogNSxcbiAgc2F0dXJkYXk6IDYsXG59XG5cbi8qKlxuICogTm9ybWFsaXplIGEgVGltZVN0YW1wIHRvIHRvdGFsIG1pbnV0ZXMgZnJvbSBzdGFydCBvZiBkYXlcbiAqL1xuZnVuY3Rpb24gbm9ybWFsaXplVGltZVRvTWludXRlcyh0aW1lU3RhbXA6IFRpbWVTdGFtcCk6IG51bWJlciB7XG4gIGlmICh0aW1lU3RhbXAgPT09IHVuZGVmaW5lZCB8fCB0aW1lU3RhbXAgPT09IG51bGwpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3RpbWVTdGFtcCBpcyByZXF1aXJlZCBhbmQgY2Fubm90IGJlIHVuZGVmaW5lZCBvciBudWxsJylcbiAgfVxuICBpZiAodHlwZW9mIHRpbWVTdGFtcCA9PT0gJ251bWJlcicpIHtcbiAgICByZXR1cm4gdGltZVN0YW1wICogNjAgLy8gQ29udmVydCBob3VycyB0byBtaW51dGVzXG4gIH1cbiAgY29uc3QgbWludXRlID0gdGltZVN0YW1wLm1pbnV0ZSA/PyAwXG4gIGNvbnN0IHNlY29uZCA9IHRpbWVTdGFtcC5zZWNvbmQgPz8gMFxuICByZXR1cm4gdGltZVN0YW1wLmhvdXIgKiA2MCArIG1pbnV0ZSArIE1hdGguZmxvb3Ioc2Vjb25kIC8gNjApXG59XG5cbi8qKlxuICogRXh0cmFjdCBob3VyIGZyb20gYSBUaW1lU3RhbXBcbiAqL1xuZnVuY3Rpb24gZ2V0SG91ckZyb21UaW1lU3RhbXAodGltZVN0YW1wOiBUaW1lU3RhbXApOiBudW1iZXIge1xuICBpZiAodGltZVN0YW1wID09PSB1bmRlZmluZWQgfHwgdGltZVN0YW1wID09PSBudWxsKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCd0aW1lU3RhbXAgaXMgcmVxdWlyZWQgYW5kIGNhbm5vdCBiZSB1bmRlZmluZWQgb3IgbnVsbCcpXG4gIH1cbiAgaWYgKHR5cGVvZiB0aW1lU3RhbXAgPT09ICdudW1iZXInKSB7XG4gICAgcmV0dXJuIHRpbWVTdGFtcFxuICB9XG4gIHJldHVybiB0aW1lU3RhbXAuaG91clxufVxuXG4vKipcbiAqIEV4dHJhY3QgbWludXRlIGZyb20gYSBUaW1lU3RhbXBcbiAqL1xuZnVuY3Rpb24gZ2V0TWludXRlRnJvbVRpbWVTdGFtcCh0aW1lU3RhbXA6IFRpbWVTdGFtcCk6IG51bWJlciB7XG4gIGlmICh0aW1lU3RhbXAgPT09IHVuZGVmaW5lZCB8fCB0aW1lU3RhbXAgPT09IG51bGwpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3RpbWVTdGFtcCBpcyByZXF1aXJlZCBhbmQgY2Fubm90IGJlIHVuZGVmaW5lZCBvciBudWxsJylcbiAgfVxuICBpZiAodHlwZW9mIHRpbWVTdGFtcCA9PT0gJ251bWJlcicpIHtcbiAgICByZXR1cm4gMCAvLyBEZWZhdWx0IHRvIDAgbWludXRlcyBpZiBvbmx5IGhvdXIgaXMgc3BlY2lmaWVkXG4gIH1cbiAgcmV0dXJuIHRpbWVTdGFtcC5taW51dGUgPz8gMFxufVxuXG4vKipcbiAqIEdldCB0aW1lem9uZSBpbmZvIGZvciBhIGRhdGVcbiAqL1xuZnVuY3Rpb24gZ2V0VGltZXpvbmVJbmZvKFxuICBkYXRlOiBEYXRlLFxuICB0aW1lem9uZTogc3RyaW5nLFxuKToge1xuICBkYXk6IG51bWJlclxuICBob3VyOiBudW1iZXJcbiAgbWludXRlOiBudW1iZXJcbiAgdG90YWxNaW51dGVzOiBudW1iZXJcbn0ge1xuICBjb25zdCBmb3JtYXR0ZXIgPSBuZXcgSW50bC5EYXRlVGltZUZvcm1hdCgnZW4tVVMnLCB7XG4gICAgdGltZVpvbmU6IHRpbWV6b25lLFxuICAgIHllYXI6ICdudW1lcmljJyxcbiAgICBtb250aDogJzItZGlnaXQnLFxuICAgIGRheTogJzItZGlnaXQnLFxuICAgIGhvdXI6ICcyLWRpZ2l0JyxcbiAgICBtaW51dGU6ICcyLWRpZ2l0JyxcbiAgICBzZWNvbmQ6ICcyLWRpZ2l0JyxcbiAgICBob3VyMTI6IGZhbHNlLFxuICB9KVxuXG4gIGNvbnN0IHBhcnRzID0gZm9ybWF0dGVyLmZvcm1hdFRvUGFydHMoZGF0ZSlcbiAgY29uc3QgcGFydHNPYmogPSBwYXJ0cy5yZWR1Y2UoXG4gICAgKGFjYywgcGFydCkgPT4ge1xuICAgICAgYWNjW3BhcnQudHlwZV0gPSBwYXJ0LnZhbHVlXG4gICAgICByZXR1cm4gYWNjXG4gICAgfSxcbiAgICB7fSBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LFxuICApXG4gIHJldHVybiB7XG4gICAgZGF5OiBuZXcgRGF0ZShcbiAgICAgIHBhcnNlSW50KHBhcnRzT2JqLnllYXIgPz8gJzAnKSxcbiAgICAgIHBhcnNlSW50KHBhcnRzT2JqLm1vbnRoID8/ICcxJykgLSAxLFxuICAgICAgcGFyc2VJbnQocGFydHNPYmouZGF5ID8/ICcxJyksXG4gICAgKS5nZXREYXkoKSxcbiAgICBob3VyOiBwYXJzZUludChwYXJ0c09iai5ob3VyID8/ICcwJyksXG4gICAgbWludXRlOiBwYXJzZUludChwYXJ0c09iai5taW51dGUgPz8gJzAnKSxcbiAgICB0b3RhbE1pbnV0ZXM6XG4gICAgICBwYXJzZUludChwYXJ0c09iai5ob3VyID8/ICcwJykgKiA2MCArIHBhcnNlSW50KHBhcnRzT2JqLm1pbnV0ZSA/PyAnMCcpLFxuICB9XG59XG5cbi8qKlxuICogQ2hlY2sgaWYgYSBkYXRlIGZhbGxzIHdpdGhpbiBhIHNwZWNpZmljIHRpbWUgd2luZG93XG4gKi9cbmZ1bmN0aW9uIGlzVGltZUluV2luZG93U2xvdChkYXRlOiBEYXRlLCB3aW5kb3c6IFRpbWVXaW5kb3dTbG90KTogYm9vbGVhbiB7XG4gIGlmICghd2luZG93IHx8IHdpbmRvdy5zdGFydFRpbWUgPT09IHVuZGVmaW5lZCB8fCB3aW5kb3cuZW5kVGltZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICBjb25zdCB7XG4gICAgZGF5czogZGF5c09mV2VlayxcbiAgICBzdGFydFRpbWU6IHdpbmRvd1N0YXJ0VGltZSxcbiAgICBlbmRUaW1lOiB3aW5kb3dFbmRUaW1lLFxuICAgIHRpbWV6b25lLFxuICB9ID0gd2luZG93XG5cbiAgLy8gVXNlIHByb3ZpZGVkIHRpbWV6b25lIG9yIGRlZmF1bHQgdG8gVVRDXG4gIGNvbnN0IHR6ID0gdGltZXpvbmUgPz8gJ1VUQydcblxuICAvLyBOb3JtYWxpemUgc3RhcnQgYW5kIGVuZCB0aW1lcyB0byBtaW51dGVzIGZyb20gc3RhcnQgb2YgZGF5XG4gIGNvbnN0IHdpbmRvd1N0YXJ0TWludXRlcyA9IG5vcm1hbGl6ZVRpbWVUb01pbnV0ZXMod2luZG93U3RhcnRUaW1lKVxuICBjb25zdCB3aW5kb3dFbmRNaW51dGVzID0gbm9ybWFsaXplVGltZVRvTWludXRlcyh3aW5kb3dFbmRUaW1lKVxuXG4gIC8vIFBhcnNlIGFsbG93ZWQgZGF5cyB0byBudW1iZXJzXG4gIGNvbnN0IGFsbG93ZWREYXlzID0gZGF5c09mV2Vla1xuICAgIC5tYXAoKGRheTogc3RyaW5nKSA9PiB7XG4gICAgICByZXR1cm4gZGF5TmFtZVRvTnVtYmVyW2RheS50b0xvd2VyQ2FzZSgpXSA/PyBwYXJzZUludChkYXkpXG4gICAgfSlcbiAgICAuZmlsdGVyKChkYXk6IG51bWJlcikgPT4gIWlzTmFOKGRheSkgJiYgZGF5ID49IDAgJiYgZGF5IDw9IDYpXG5cbiAgY29uc3QgdHpJbmZvID0gZ2V0VGltZXpvbmVJbmZvKGRhdGUsIHR6KVxuXG4gIHJldHVybiAoXG4gICAgYWxsb3dlZERheXMuaW5jbHVkZXModHpJbmZvLmRheSkgJiZcbiAgICB0ekluZm8udG90YWxNaW51dGVzID49IHdpbmRvd1N0YXJ0TWludXRlcyAmJlxuICAgIHR6SW5mby50b3RhbE1pbnV0ZXMgPCB3aW5kb3dFbmRNaW51dGVzXG4gIClcbn1cblxuLyoqXG4gKiBDYWxjdWxhdGUgdGhlIHdhaXQgdGltZSBmb3IgYSB3YWl0IHN0ZXBcbiAqIEBwYXJhbSBzdGVwIFRoZSBpbnB1dCBwYXJhbWV0ZXJzIGZvciB0aGUgd2FpdCBzdGVwXG4gKiBAcGFyYW0gbm93IFRoZSBjdXJyZW50IGRhdGUvdGltZVxuICogQHJldHVybnMgVGhlIHRpbWUgdG8gd2FpdCBpbiBtaWxsaXNlY29uZHMgYW5kIHRoZSBzY2hlZHVsZWQgZGF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gY2FsY3VsYXRlV2FpdFRpbWUoXG4gIHN0ZXA6IFdhaXRJbnB1dFR5cGUsXG4gIG5vdzogRGF0ZSxcbik6IENhbGN1bGF0ZVdhaXRUaW1lUmVzdWx0IHtcbiAgY29uc3Qgbm93VGltZSA9IG5vdy5nZXRUaW1lKClcblxuICBzd2l0Y2ggKHN0ZXAubW9kZSkge1xuICAgIGNhc2UgJ2Fic29sdXRlJzoge1xuICAgICAgLy8gUmV0dXJuIHRoZSBkaWZmZXJlbmNlIGJldHdlZW4gdGhlIHRhcmdldCB0aW1lc3RhbXAgYW5kIG5vdyBpbiBtaWxsaXNlY29uZHNcbiAgICAgIGNvbnN0IHNjaGVkdWxlQXRUaW1lID1cbiAgICAgICAgdHlwZW9mIHN0ZXAuc2NoZWR1bGVBdCA9PT0gJ3N0cmluZydcbiAgICAgICAgICA/IG5ldyBEYXRlKHN0ZXAuc2NoZWR1bGVBdCkuZ2V0VGltZSgpXG4gICAgICAgICAgOiBzdGVwLnNjaGVkdWxlQXRcblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgd2FpdFRpbWU6IE1hdGgubWF4KDAsIHNjaGVkdWxlQXRUaW1lIC0gbm93VGltZSksXG4gICAgICAgIHNjaGVkdWxlZEF0OiBuZXcgRGF0ZShzY2hlZHVsZUF0VGltZSksXG4gICAgICB9XG4gICAgfVxuXG4gICAgY2FzZSAncmVsYXRpdmUnOiB7XG4gICAgICAvLyBJZiBubyBhcmd1bWVudHMgcHJvdmlkZWQsIGV4ZWN1dGUgaW1tZWRpYXRlbHlcbiAgICAgIGlmICghc3RlcC5hbW91bnQgJiYgKCFzdGVwLndpbmRvd3MgfHwgc3RlcC53aW5kb3dzLmxlbmd0aCA9PT0gMCkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB3YWl0VGltZTogMCxcbiAgICAgICAgICBzY2hlZHVsZWRBdDogbm93LFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIENhbGN1bGF0ZSByZWxhdGl2ZSBkZWxheSBpZiBhbW91bnQgaXMgcHJvdmlkZWRcbiAgICAgIGxldCByZWxhdGl2ZURlbGF5ID0gMFxuICAgICAgaWYgKHN0ZXAuYW1vdW50ICYmIHN0ZXAudW5pdCkge1xuICAgICAgICBzd2l0Y2ggKHN0ZXAudW5pdCkge1xuICAgICAgICAgIGNhc2UgJ3NlY29uZHMnOlxuICAgICAgICAgIGNhc2UgJ3NlY29uZCc6XG4gICAgICAgICAgICByZWxhdGl2ZURlbGF5ID0gc3RlcC5hbW91bnQgKiAxMDAwXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgJ21pbnV0ZXMnOlxuICAgICAgICAgIGNhc2UgJ21pbnV0ZSc6XG4gICAgICAgICAgICByZWxhdGl2ZURlbGF5ID0gc3RlcC5hbW91bnQgKiA2MCAqIDEwMDBcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSAnaG91cnMnOlxuICAgICAgICAgIGNhc2UgJ2hvdXInOlxuICAgICAgICAgICAgcmVsYXRpdmVEZWxheSA9IHN0ZXAuYW1vdW50ICogNjAgKiA2MCAqIDEwMDBcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSAnZGF5cyc6XG4gICAgICAgICAgY2FzZSAnZGF5JzpcbiAgICAgICAgICAgIHJlbGF0aXZlRGVsYXkgPSBzdGVwLmFtb3VudCAqIDI0ICogNjAgKiA2MCAqIDEwMDBcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSAnd2Vla3MnOlxuICAgICAgICAgIGNhc2UgJ3dlZWsnOlxuICAgICAgICAgICAgcmVsYXRpdmVEZWxheSA9IHN0ZXAuYW1vdW50ICogNyAqIDI0ICogNjAgKiA2MCAqIDEwMDBcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSAnbW9udGhzJzpcbiAgICAgICAgICBjYXNlICdtb250aCc6IHtcbiAgICAgICAgICAgIC8vIEFwcHJveGltYXRlIG1vbnRocyBhcyAzMCBkYXlzXG4gICAgICAgICAgICByZWxhdGl2ZURlbGF5ID0gc3RlcC5hbW91bnQgKiAzMCAqIDI0ICogNjAgKiA2MCAqIDEwMDBcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgfVxuICAgICAgICAgIGNhc2UgJ3llYXJzJzpcbiAgICAgICAgICBjYXNlICd5ZWFyJzoge1xuICAgICAgICAgICAgLy8gQXBwcm94aW1hdGUgeWVhcnMgYXMgMzY1IGRheXNcbiAgICAgICAgICAgIHJlbGF0aXZlRGVsYXkgPSBzdGVwLmFtb3VudCAqIDM2NSAqIDI0ICogNjAgKiA2MCAqIDEwMDBcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIElmIG5vIHdpbmRvd3Mgc3BlY2lmaWVkLCBqdXN0IHJldHVybiB0aGUgcmVsYXRpdmUgZGVsYXlcbiAgICAgIGlmICghc3RlcC53aW5kb3dzIHx8IHN0ZXAud2luZG93cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB3YWl0VGltZTogcmVsYXRpdmVEZWxheSxcbiAgICAgICAgICBzY2hlZHVsZWRBdDogbmV3IERhdGUobm93VGltZSArIHJlbGF0aXZlRGVsYXkpLFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIENoZWNrIGlmIHRoZSB0YXJnZXQgdGltZSAobm93ICsgcmVsYXRpdmUgZGVsYXkpIGZhbGxzIHdpdGhpbiBBTlkgd2luZG93XG4gICAgICBjb25zdCB0YXJnZXREYXRlID0gbmV3IERhdGUobm93VGltZSArIHJlbGF0aXZlRGVsYXkpXG5cbiAgICAgIC8vIENoZWNrIGlmIHRhcmdldCB0aW1lIGZhbGxzIHdpdGhpbiBhbnkgd2luZG93XG4gICAgICBmb3IgKGNvbnN0IHdpbmRvdyBvZiBzdGVwLndpbmRvd3MpIHtcbiAgICAgICAgaWYgKGlzVGltZUluV2luZG93U2xvdCh0YXJnZXREYXRlLCB3aW5kb3cpKSB7XG4gICAgICAgICAgLy8gVGFyZ2V0IGlzIGFscmVhZHkgaW4gYW4gYWxsb3dlZCB3aW5kb3csIHVzZSByZWxhdGl2ZSBkZWxheVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB3YWl0VGltZTogcmVsYXRpdmVEZWxheSxcbiAgICAgICAgICAgIHNjaGVkdWxlZEF0OiBuZXcgRGF0ZShub3dUaW1lICsgcmVsYXRpdmVEZWxheSksXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFRhcmdldCB0aW1lIGRvZXNuJ3QgZmFsbCBpbiBhbnkgd2luZG93LCBmaW5kIHRoZSBuZXh0IGF2YWlsYWJsZSB3aW5kb3dcbiAgICAgIC8vIEZpbmQgdGhlIGVhcmxpZXN0IG5leHQgYXZhaWxhYmxlIHdpbmRvdyBhY3Jvc3MgQUxMIHdpbmRvd3MsIHJlbGF0aXZlIHRvIHRhcmdldERhdGVcbiAgICAgIGxldCBlYXJsaWVzdFNjaGVkdWxlZFRpbWU6IERhdGUgfCBudWxsID0gbnVsbFxuICAgICAgbGV0IGVhcmxpZXN0V2FpdFRpbWUgPSBJbmZpbml0eVxuXG4gICAgICBmb3IgKGNvbnN0IHdpbmRvdyBvZiBzdGVwLndpbmRvd3MpIHtcbiAgICAgICAgaWYgKCF3aW5kb3cgfHwgd2luZG93LnN0YXJ0VGltZSA9PT0gdW5kZWZpbmVkIHx8IHdpbmRvdy5lbmRUaW1lID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgeyBkYXlzOiBkYXlzT2ZXZWVrLCBzdGFydFRpbWU6IHdpbmRvd1N0YXJ0VGltZSwgdGltZXpvbmUgfSA9IHdpbmRvd1xuXG4gICAgICAgIC8vIFVzZSBwcm92aWRlZCB0aW1lem9uZSBvciBkZWZhdWx0IHRvIFVUQ1xuICAgICAgICBjb25zdCB0eiA9IHRpbWV6b25lID8/ICdVVEMnXG5cbiAgICAgICAgLy8gTm9ybWFsaXplIHN0YXJ0IHRpbWUgdG8gbWludXRlcyBmcm9tIHN0YXJ0IG9mIGRheVxuICAgICAgICBjb25zdCB3aW5kb3dTdGFydE1pbnV0ZXMgPSBub3JtYWxpemVUaW1lVG9NaW51dGVzKHdpbmRvd1N0YXJ0VGltZSlcblxuICAgICAgICAvLyBFeHRyYWN0IGhvdXIgYW5kIG1pbnV0ZSBjb21wb25lbnRzIGZvciBjb21wYXJpc29uc1xuICAgICAgICBjb25zdCB3aW5kb3dTdGFydEhvdXIgPSBnZXRIb3VyRnJvbVRpbWVTdGFtcCh3aW5kb3dTdGFydFRpbWUpXG4gICAgICAgIGNvbnN0IHdpbmRvd1N0YXJ0TWludXRlID0gZ2V0TWludXRlRnJvbVRpbWVTdGFtcCh3aW5kb3dTdGFydFRpbWUpXG5cbiAgICAgICAgLy8gUGFyc2UgYWxsb3dlZCBkYXlzIHRvIG51bWJlcnNcbiAgICAgICAgY29uc3QgYWxsb3dlZERheXMgPSBkYXlzT2ZXZWVrXG4gICAgICAgICAgLm1hcCgoZGF5OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBkYXlOYW1lVG9OdW1iZXJbZGF5LnRvTG93ZXJDYXNlKCldID8/IHBhcnNlSW50KGRheSlcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5maWx0ZXIoKGRheTogbnVtYmVyKSA9PiAhaXNOYU4oZGF5KSAmJiBkYXkgPj0gMCAmJiBkYXkgPD0gNilcblxuICAgICAgICAvLyBHZXQgdGhlIHRhcmdldCBkYXkgYW5kIHRpbWUgaW4gdGhlIHRhcmdldCB0aW1lem9uZSAocmVsYXRpdmUgdG8gdGFyZ2V0RGF0ZSlcbiAgICAgICAgY29uc3QgdGFyZ2V0VHpJbmZvID0gZ2V0VGltZXpvbmVJbmZvKHRhcmdldERhdGUsIHR6KVxuICAgICAgICBjb25zdCBjdXJyZW50RGF5ID0gdGFyZ2V0VHpJbmZvLmRheVxuICAgICAgICBjb25zdCBjdXJyZW50SG91ciA9IHRhcmdldFR6SW5mby5ob3VyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRNaW51dGUgPSB0YXJnZXRUekluZm8ubWludXRlXG4gICAgICAgIGNvbnN0IGN1cnJlbnRUb3RhbE1pbnV0ZXMgPSB0YXJnZXRUekluZm8udG90YWxNaW51dGVzXG5cbiAgICAgICAgbGV0IHdpbmRvd1dhaXRUaW1lOiBudW1iZXJcbiAgICAgICAgbGV0IHdpbmRvd1NjaGVkdWxlZFRpbWU6IERhdGVcblxuICAgICAgICAvLyBDaGVjayBpZiB3ZSBjYW4gc2NoZWR1bGUgZm9yIHRvZGF5XG4gICAgICAgIGlmIChcbiAgICAgICAgICBhbGxvd2VkRGF5cy5pbmNsdWRlcyhjdXJyZW50RGF5KSAmJlxuICAgICAgICAgIGN1cnJlbnRUb3RhbE1pbnV0ZXMgPCB3aW5kb3dTdGFydE1pbnV0ZXNcbiAgICAgICAgKSB7XG4gICAgICAgICAgLy8gQ2FsY3VsYXRlIG1pbGxpc2Vjb25kcyB1bnRpbCB3aW5kb3cgc3RhcnRzIHRvZGF5XG4gICAgICAgICAgY29uc3QgbWludXRlc1VudGlsV2luZG93ID0gd2luZG93U3RhcnRNaW51dGVzIC0gY3VycmVudFRvdGFsTWludXRlc1xuICAgICAgICAgIHdpbmRvd1dhaXRUaW1lID0gbWludXRlc1VudGlsV2luZG93ICogNjAgKiAxMDAwXG4gICAgICAgICAgd2luZG93U2NoZWR1bGVkVGltZSA9IG5ldyBEYXRlKHRhcmdldERhdGUuZ2V0VGltZSgpICsgd2luZG93V2FpdFRpbWUpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gRmluZCB0aGUgbmV4dCBhbGxvd2VkIGRheSBmb3IgdGhpcyB3aW5kb3dcbiAgICAgICAgICBsZXQgZGF5c1RvQWRkID0gMVxuXG4gICAgICAgICAgLy8gQ2hlY2sgZWFjaCBkYXkgc3RhcnRpbmcgZnJvbSB0b21vcnJvd1xuICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDw9IDc7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgbmV4dERheSA9IChjdXJyZW50RGF5ICsgaSkgJSA3XG4gICAgICAgICAgICBpZiAoYWxsb3dlZERheXMuaW5jbHVkZXMobmV4dERheSkpIHtcbiAgICAgICAgICAgICAgZGF5c1RvQWRkID0gaVxuICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIENhbGN1bGF0ZSB0b3RhbCB3YWl0IHRpbWUgZm9yIHRoaXMgd2luZG93XG4gICAgICAgICAgY29uc3QgbWlsbGlzZWNvbmRzUGVyRGF5ID0gMjQgKiA2MCAqIDYwICogMTAwMFxuICAgICAgICAgIGNvbnN0IG1pbGxpc2Vjb25kc1BlckhvdXIgPSA2MCAqIDYwICogMTAwMFxuICAgICAgICAgIGNvbnN0IG1pbGxpc2Vjb25kc1Blck1pbnV0ZSA9IDYwICogMTAwMFxuXG4gICAgICAgICAgY29uc3QgZGF5c01zID0gZGF5c1RvQWRkICogbWlsbGlzZWNvbmRzUGVyRGF5XG4gICAgICAgICAgY29uc3QgaG91cnNBZGp1c3RtZW50ID1cbiAgICAgICAgICAgICh3aW5kb3dTdGFydEhvdXIgLSBjdXJyZW50SG91cikgKiBtaWxsaXNlY29uZHNQZXJIb3VyXG4gICAgICAgICAgY29uc3QgbWludXRlc0FkanVzdG1lbnQgPVxuICAgICAgICAgICAgKHdpbmRvd1N0YXJ0TWludXRlIC0gY3VycmVudE1pbnV0ZSkgKiBtaWxsaXNlY29uZHNQZXJNaW51dGVcblxuICAgICAgICAgIHdpbmRvd1dhaXRUaW1lID0gZGF5c01zICsgaG91cnNBZGp1c3RtZW50ICsgbWludXRlc0FkanVzdG1lbnRcbiAgICAgICAgICB3aW5kb3dTY2hlZHVsZWRUaW1lID0gbmV3IERhdGUodGFyZ2V0RGF0ZS5nZXRUaW1lKCkgKyB3aW5kb3dXYWl0VGltZSlcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENoZWNrIGlmIHRoaXMgd2luZG93IGhhcyB0aGUgZWFybGllc3Qgc2NoZWR1bGVkIHRpbWVcbiAgICAgICAgaWYgKHdpbmRvd1dhaXRUaW1lIDwgZWFybGllc3RXYWl0VGltZSkge1xuICAgICAgICAgIGVhcmxpZXN0V2FpdFRpbWUgPSB3aW5kb3dXYWl0VGltZVxuICAgICAgICAgIGVhcmxpZXN0U2NoZWR1bGVkVGltZSA9IHdpbmRvd1NjaGVkdWxlZFRpbWVcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBSZXR1cm4gdGhlIGVhcmxpZXN0IGZvdW5kIHdpbmRvdyBtZWFzdXJlZCBmcm9tIHRhcmdldERhdGUgKG5vdyArIHJlbGF0aXZlRGVsYXkpXG4gICAgICBpZiAoZWFybGllc3RTY2hlZHVsZWRUaW1lKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgd2FpdFRpbWU6IHJlbGF0aXZlRGVsYXkgKyBlYXJsaWVzdFdhaXRUaW1lLFxuICAgICAgICAgIHNjaGVkdWxlZEF0OiBlYXJsaWVzdFNjaGVkdWxlZFRpbWUsXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gRmFsbGJhY2sgdG8gZmlyc3Qgd2luZG93IGlmIG5vIHZhbGlkIHdpbmRvd3MgZm91bmQgKHNob3VsZCBub3QgaGFwcGVuIHdpdGggdmFsaWQgaW5wdXQpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHZhbGlkIHRpbWUgd2luZG93cyBmb3VuZCBmb3Igc2NoZWR1bGluZycpXG4gICAgfVxuXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVW5zdXBwb3J0ZWQgd2FpdCBtb2RlOiAkeyhzdGVwIGFzIGFueSkubW9kZX1gKVxuICB9XG59XG4iXX0=