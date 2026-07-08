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
}

/**
 * Standard estimate payload for tool estimate mode and platform estimate APIs.
 * Channel-agnostic — integrations populate `cost` when pricing is known.
 */
export interface Estimation {
  deliverableCount: number
  skippedCount?: number
  cost?: MoneyMinorRange
}

export const MoneyMinorRangeSchema = z.object({
  currency: z.string().min(3).max(3),
  minorUnitsLow: z.number().int().nonnegative(),
  minorUnitsHigh: z.number().int().nonnegative(),
})

export const EstimationSchema = z.object({
  deliverableCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative().optional(),
  cost: MoneyMinorRangeSchema.optional(),
})

export function createMoneyMinorRange(params: {
  currency: string
  minorUnitsLow: number
  minorUnitsHigh: number
}): MoneyMinorRange {
  return {
    currency: params.currency,
    minorUnitsLow: params.minorUnitsLow,
    minorUnitsHigh: params.minorUnitsHigh,
  }
}

export function createEstimation(params: {
  deliverableCount: number
  skippedCount?: number
  cost?: MoneyMinorRange
}): Estimation {
  return {
    deliverableCount: params.deliverableCount,
    ...(params.skippedCount !== undefined ? { skippedCount: params.skippedCount } : {}),
    ...(params.cost ? { cost: params.cost } : {}),
  }
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
    }),
  })
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
