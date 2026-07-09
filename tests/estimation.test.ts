import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  computeSkewedExpectedMinorUnits,
  createMoneyMinorRange,
  formatMoneyMinorEstimate,
  formatMoneyMinorRange,
} from '../src/types/estimation.js'

describe('formatMoneyMinorEstimate', () => {
  test('shows single amount when low equals high', () => {
    const range = createMoneyMinorRange({
      currency: 'AUD',
      minorUnitsLow: 308,
      minorUnitsHigh: 308,
    })

    const formatted = formatMoneyMinorEstimate(range, { locale: 'en-AU' })
    assert.match(formatted, /3\.08/)
    assert.doesNotMatch(formatted, /~/)
  })

  test('shows skewed ~estimate for moderate spread', () => {
    const range = createMoneyMinorRange({
      currency: 'AUD',
      minorUnitsLow: 308,
      minorUnitsHigh: 616,
      minorUnitsExpected: 370,
    })

    const formatted = formatMoneyMinorEstimate(range, { locale: 'en-AU' })
    assert.match(formatted, /^~.*3\.70/)
  })

  test('falls back to range when spread exceeds threshold', () => {
    const range = createMoneyMinorRange({
      currency: 'AUD',
      minorUnitsLow: 100,
      minorUnitsHigh: 400,
    })

    assert.equal(
      formatMoneyMinorEstimate(range, { locale: 'en-AU', maxSpreadRatio: 2 }),
      formatMoneyMinorRange(range, 'en-AU'),
    )
  })

  test('computeSkewedExpectedMinorUnits skews toward lower bound', () => {
    const range = createMoneyMinorRange({
      currency: 'AUD',
      minorUnitsLow: 308,
      minorUnitsHigh: 616,
    })

    assert.equal(computeSkewedExpectedMinorUnits(range), 370)
  })
})
