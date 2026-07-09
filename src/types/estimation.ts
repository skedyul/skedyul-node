import { z } from 'zod/v4'

import type { ToolBilling } from './tool'

/**
 * Money expressed in a currency's minor unit (e.g. cents, pence).
 * Use ISO 4217 codes so amounts format correctly across locales.
 */
export interface MoneyMinorUnits {
  /** ISO 4217 currency code (USD, AUD, EUR, …) */
  currency: string
  /** Amount in the currency's smallest unit */
  minorUnits: number
}

/** Inclusive range of estimated charges in minor currency units. */
export interface MoneyMinorRange {
  currency: string
  minorUnitsLow: number
  minorUnitsHigh: number
  /** Optional skewed expected charge for single-value display (~$X.XX). */
  minorUnitsExpected?: number
}

/** Why a cohort member was excluded from a bulk send estimate. */
export interface EstimationSkippedBreakdown {
  missingAddress: number
  optOut: number
  emptyMessage: number
  unavailable: number
}

/**
 * Standard estimate payload for tool estimate mode and platform estimate APIs.
 * Channel-agnostic — integrations populate `cost` when pricing is known.
 */
export interface Estimation {
  deliverableCount: number
  skippedCount?: number
  skippedBreakdown?: EstimationSkippedBreakdown
  cost?: MoneyMinorRange
}

export const MoneyMinorRangeSchema = z.object({
  currency: z.string().min(3).max(3),
  minorUnitsLow: z.number().int().nonnegative(),
  minorUnitsHigh: z.number().int().nonnegative(),
  minorUnitsExpected: z.number().int().nonnegative().optional(),
})

export const EstimationSkippedBreakdownSchema = z.object({
  missingAddress: z.number().int().nonnegative(),
  optOut: z.number().int().nonnegative(),
  emptyMessage: z.number().int().nonnegative(),
  unavailable: z.number().int().nonnegative(),
})

export const EstimationSchema = z.object({
  deliverableCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative().optional(),
  skippedBreakdown: EstimationSkippedBreakdownSchema.optional(),
  cost: MoneyMinorRangeSchema.optional(),
})

export function createMoneyMinorRange(params: {
  currency: string
  minorUnitsLow: number
  minorUnitsHigh: number
  minorUnitsExpected?: number
}): MoneyMinorRange {
  return {
    currency: params.currency,
    minorUnitsLow: params.minorUnitsLow,
    minorUnitsHigh: params.minorUnitsHigh,
    ...(params.minorUnitsExpected !== undefined
      ? { minorUnitsExpected: params.minorUnitsExpected }
      : {}),
  }
}

export function createEstimation(params: {
  deliverableCount: number
  skippedCount?: number
  skippedBreakdown?: EstimationSkippedBreakdown
  cost?: MoneyMinorRange
}): Estimation {
  return {
    deliverableCount: params.deliverableCount,
    ...(params.skippedCount !== undefined ? { skippedCount: params.skippedCount } : {}),
    ...(params.skippedBreakdown ? { skippedBreakdown: params.skippedBreakdown } : {}),
    ...(params.cost ? { cost: params.cost } : {}),
  }
}

/** Skew expected cost toward the typical case when only a range is known. */
export function computeSkewedExpectedMinorUnits(range: MoneyMinorRange): number {
  if (range.minorUnitsExpected !== undefined) {
    return range.minorUnitsExpected
  }

  if (range.minorUnitsLow === range.minorUnitsHigh) {
    return range.minorUnitsLow
  }

  return Math.round(0.8 * range.minorUnitsLow + 0.2 * range.minorUnitsHigh)
}

export type FormatMoneyMinorEstimateOptions = {
  locale?: string
  /** When set, overrides computed skew for display. */
  expectedMinorUnits?: number
  /** Show a range instead of ~estimate when high/low ratio exceeds this (default 4). */
  maxSpreadRatio?: number
}

/** Format a minor-unit cost range for display (single amount when low === high). */
export function formatMoneyMinorRange(
  range: MoneyMinorRange,
  locale?: string,
): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: range.currency,
  })
  const low = formatter.format(range.minorUnitsLow / 100)
  const high = formatter.format(range.minorUnitsHigh / 100)

  if (range.minorUnitsLow === range.minorUnitsHigh) {
    return low
  }

  return `${low} – ${high}`
}

/**
 * Format an estimated charge for UI: prefer a single ~$X.XX educated guess.
 * Falls back to a low–high range when the spread is still too wide.
 */
export function formatMoneyMinorEstimate(
  range: MoneyMinorRange,
  options?: FormatMoneyMinorEstimateOptions,
): string {
  const formatter = new Intl.NumberFormat(options?.locale, {
    style: 'currency',
    currency: range.currency,
  })

  const maxSpreadRatio = options?.maxSpreadRatio ?? 4
  const spreadRatio =
    range.minorUnitsLow > 0
      ? range.minorUnitsHigh / range.minorUnitsLow
      : 1

  if (spreadRatio > maxSpreadRatio) {
    return formatMoneyMinorRange(range, options?.locale)
  }

  const expectedMinorUnits =
    options?.expectedMinorUnits ?? computeSkewedExpectedMinorUnits(range)
  const expected = formatter.format(expectedMinorUnits / 100)

  if (range.minorUnitsLow === range.minorUnitsHigh) {
    return expected
  }

  return `~${expected}`
}

/** Read standardized estimation from tool billing (supports legacy flat cost fields). */
export function parseEstimationFromBilling(
  billing?: ToolBilling | Record<string, unknown>,
): Estimation | undefined {
  if (!billing || typeof billing !== 'object') {
    return undefined
  }

  const record = billing as Record<string, unknown>
  const nested = record.estimation
  if (nested && typeof nested === 'object') {
    const parsed = EstimationSchema.safeParse(nested)
    if (parsed.success) {
      return parsed.data
    }
  }

  const currency =
    typeof record.currency === 'string' && record.currency.trim() !== ''
      ? record.currency
      : undefined
  const minorUnitsLow =
    typeof record.minorUnitsLow === 'number'
      ? record.minorUnitsLow
      : typeof record.costCentsLow === 'number'
        ? record.costCentsLow
        : undefined
  const minorUnitsHigh =
    typeof record.minorUnitsHigh === 'number'
      ? record.minorUnitsHigh
      : typeof record.costCentsHigh === 'number'
        ? record.costCentsHigh
        : undefined
  const minorUnitsExpected =
    typeof record.minorUnitsExpected === 'number'
      ? record.minorUnitsExpected
      : typeof record.costCentsExpected === 'number'
        ? record.costCentsExpected
        : undefined
  const deliverableCount =
    typeof record.deliverableCount === 'number' ? record.deliverableCount : undefined

  if (
    deliverableCount === undefined ||
    minorUnitsLow === undefined ||
    minorUnitsHigh === undefined ||
    !currency
  ) {
    return undefined
  }

  return createEstimation({
    deliverableCount,
    skippedCount:
      typeof record.skippedCount === 'number' ? record.skippedCount : undefined,
    cost: createMoneyMinorRange({
      currency,
      minorUnitsLow,
      minorUnitsHigh,
      ...(minorUnitsExpected !== undefined ? { minorUnitsExpected } : {}),
    }),
  })
}
