# Estimation and billing

Standard types for tool cost estimates and usage billing. Source: `src/types/estimation.ts` and `src/types/tool.ts`.

Import helpers from `skedyul` or `skedyul/estimation` (re-exports the same symbols).

---

## `Estimation`

Channel-agnostic estimate payload for tool estimate mode and platform estimate APIs:

```ts
interface Estimation {
  deliverableCount: number
  skippedCount?: number
  skippedBreakdown?: EstimationSkippedBreakdown
  cost?: MoneyMinorRange
}
```

| Field | Meaning |
|-------|---------|
| `deliverableCount` | Items that will be sent/processed |
| `skippedCount` | Items excluded from delivery |
| `skippedBreakdown` | Why items were skipped (see below) |
| `cost` | Estimated charge range in minor currency units |

### Skipped breakdown

```ts
interface EstimationSkippedBreakdown {
  missingAddress: number
  optOut: number
  emptyMessage: number
  unavailable: number
}
```

Used for bulk sends (SMS, email) where cohort members are filtered before delivery.

---

## Money types

Amounts use **minor units** (cents, pence) with ISO 4217 currency codes:

```ts
interface MoneyMinorUnits {
  currency: string      // "USD", "AUD", "EUR"
  minorUnits: number    // 150 = $1.50
}

interface MoneyMinorRange {
  currency: string
  minorUnitsLow: number
  minorUnitsHigh: number
  minorUnitsExpected?: number   // optional skewed display value
}
```

---

## Helpers

### Create estimates

```ts
import { createEstimation, createMoneyMinorRange } from 'skedyul'

const estimate = createEstimation({
  deliverableCount: 42,
  skippedCount: 3,
  skippedBreakdown: { missingAddress: 2, optOut: 1, emptyMessage: 0, unavailable: 0 },
  cost: createMoneyMinorRange({
    currency: 'AUD',
    minorUnitsLow: 420,
    minorUnitsHigh: 840,
    minorUnitsExpected: 504,
  }),
})
```

### Format for UI

```ts
import { formatMoneyMinorEstimate, formatMoneyMinorRange } from 'skedyul'

formatMoneyMinorRange(range)           // "$4.20 – $8.40"
formatMoneyMinorEstimate(range)        // "~$5.04" (skewed expected)
formatMoneyMinorEstimate(range, { locale: 'en-AU' })
```

`formatMoneyMinorEstimate` shows a single `~$X.XX` when the spread ratio is ≤ 4 (default). Wider spreads fall back to a range display.

Skew calculation when `minorUnitsExpected` is omitted:

```ts
computeSkewedExpectedMinorUnits(range)
// 80% low + 20% high when low ≠ high
```

---

## Tool billing

Return billing info from tool handlers via `ToolBilling` on the response:

```ts
interface ToolBilling {
  credits?: number
  tokens?: number
  cost?: number
  estimation?: Estimation    // preferred for estimate mode
  // deprecated flat fields:
  costCentsLow?: number
  costCentsHigh?: number
  currency?: string
}
```

### Preferred pattern

Nest the standard estimate under `billing.estimation`:

```ts
return createSuccessResponse(output, {
  billing: {
    estimation: createEstimation({
      deliverableCount: recipients.length,
      cost: createMoneyMinorRange({ currency: 'USD', minorUnitsLow: 50, minorUnitsHigh: 100 }),
    }),
  },
})
```

### Legacy flat fields

`parseEstimationFromBilling` reads both formats:

```ts
import { parseEstimationFromBilling } from 'skedyul'

const estimate = parseEstimationFromBilling(toolResponse.billing)
```

Supports:

- `billing.estimation` (preferred)
- Flat `deliverableCount` + `costCentsLow`/`costCentsHigh`/`currency` (deprecated)

---

## Zod schemas

Validate estimate payloads:

```ts
import { EstimationSchema, MoneyMinorRangeSchema } from 'skedyul'

EstimationSchema.safeParse(payload)
MoneyMinorRangeSchema.safeParse(cost)
```

---

## Estimate mode

Tools can run in **estimate** mode (platform passes a flag) to return cost preview without executing side effects. Populate `billing.estimation` with projected `deliverableCount` and `cost` range.

Check estimate mode in the handler and skip external API calls when estimating.

---

## Related docs

- [Tools](./tools.md) — tool responses and billing fields
- [Core API](./core-api.md) — platform estimate APIs
