/**
 * Workflow-Safe Scheduling Types
 *
 * These types are plain TypeScript interfaces without zod dependencies.
 * They can be safely imported in Temporal workflow code.
 *
 * Note: The zod schemas in types.ts are the source of truth for validation.
 * These interfaces mirror them for workflow use.
 */
/**
 * TimeStamp can be either:
 * - A number representing hour of day (0-23)
 * - An object with hour, minute, second
 */
export type TimeStamp = number | {
    hour: number;
    minute?: number;
    second?: number;
};
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export interface TimeWindowSlot {
    startTime: TimeStamp;
    endTime: TimeStamp;
    days: DayOfWeek[];
    timezone?: string;
}
export type WaitUnit = 'second' | 'seconds' | 'minute' | 'minutes' | 'hour' | 'hours' | 'day' | 'days' | 'week' | 'weeks' | 'month' | 'months' | 'year' | 'years';
export interface WaitInputRelative {
    mode: 'relative';
    amount: number;
    unit: WaitUnit;
    windows?: TimeWindowSlot[];
}
export interface WaitInputAbsolute {
    mode: 'absolute';
    scheduleAt: string | number;
}
export type WaitInputType = WaitInputRelative | WaitInputAbsolute;
export interface CalculateWaitTimeResult {
    waitTime: number;
    scheduledAt: Date;
}
export interface TimeWindowPolicy {
    timezone: string;
    windows: TimeWindowSlot[];
    behavior?: {
        responseMode?: 'immediate' | 'ack_and_schedule' | 'schedule_only';
        prompt?: string;
        scheduleFor?: string;
    };
}
