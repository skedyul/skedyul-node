/**
 * Calculate Wait Time
 *
 * Calculates when to schedule a message or wait step based on relative/absolute time
 * and optional time window constraints.
 *
 * This is the source of truth - skedyul-core re-exports for backward compatibility.
 */
import type { WaitInputType, CalculateWaitTimeResult } from './types-workflow';
/**
 * Calculate the wait time for a wait step
 * @param step The input parameters for the wait step
 * @param now The current date/time
 * @returns The time to wait in milliseconds and the scheduled date
 */
export declare function calculateWaitTime(step: WaitInputType, now: Date): CalculateWaitTimeResult;
