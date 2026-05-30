/**
 * Scheduling Module
 *
 * This module provides scheduling utilities that are safe to use in Temporal workflows.
 * It intentionally avoids importing zod to prevent bundler issues.
 *
 * For zod schemas, import from './types' directly (not workflow-safe).
 */

// Workflow-safe types (no zod dependency)
export type {
  TimeStamp,
  DayOfWeek,
  TimeWindowSlot,
  WaitUnit,
  WaitInputRelative,
  WaitInputAbsolute,
  WaitInputType,
  CalculateWaitTimeResult,
  TimeWindowPolicy,
} from './types-workflow'

// Calculate wait time (workflow-safe)
export { calculateWaitTime } from './calculateWaitTime'

// Time window detection (workflow-safe)
export { isTimeInWindowSlot, isTimeInPolicy } from './isTimeInWindow'
