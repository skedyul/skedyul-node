/**
 * Time Window Detection
 *
 * Helper functions to check if a given time falls within a time window policy.
 * Used for detecting the current time context (business hours, after hours, etc.)
 */
import type { TimeWindowSlot, TimeWindowPolicy } from './types-workflow';
/**
 * Check if a date falls within a specific time window slot
 */
export declare function isTimeInWindowSlot(date: Date, slot: TimeWindowSlot, timezone?: string): boolean;
/**
 * Check if a date falls within any slot of a time window policy
 */
export declare function isTimeInPolicy(date: Date, policy: TimeWindowPolicy): boolean;
