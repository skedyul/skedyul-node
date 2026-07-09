# AI and file handling

Use platform `file.upload` and `ai.generateObject` for document parsing and structured extraction. Based on **Vetnostics** (`packages/skedyul-integrations/private/integrations/vetnostics`).

---

## Overview

Vetnostics parses veterinary lab PDFs through a pipeline:

```
Input (file_id or content)
    → file.upload (if data URL)
    → file.get (metadata)
    → ai.generateObject (phase 1: metadata + test codes)
    → ai.generateObject (phase 2: per-code specialized extraction)
    → map to tool output schema
    → createSuccessResponse (no CRM writes)
```

The tool returns structured data; workflows sync to CRM.

---

## Input modes

`parse_lab_report` accepts two inputs:

| Input | When to use | Model (Vetnostics) |
|-------|-------------|-------------------|
| `file_id` | PDF uploads via platform file API | `google/gemini-2.5-pro` |
| `content` | Plain text or HTML pasted inline | `openai/gpt-5-mini` (AI) or deterministic HTML parser |

```ts
const ParseLabReportInputSchema = z.object({
  file_id: z.string().optional()
    .describe('File ID from file.upload() - use for PDF files'),
  content: z.string().optional()
    .describe('Plain text or HTML content containing lab results'),
})
```

Validate at least one is present:

```ts
if (!input.file_id && !input.content) {
  return createValidationError('Either file_id or content must be provided')
}
```

---

## `file.upload`

Upload files to the platform before passing to AI. Prefer file IDs over inline base64 in prompts — better performance and caching.

### Standard upload (from tool caller)

Callers upload via Core API or UI, then pass `file_id` to the tool:

```ts
// Caller side (workflow, page action, CLI)
const { id } = await file.upload({
  content: base64Content,
  name: 'lab_report.pdf',
  mimeType: 'application/pdf',
})
// Pass id to parse_lab_report({ file_id: id })
```

### Data URL normalization (in tool)

Vetnostics accepts accidental data URLs and re-uploads them:

```ts
if (fileId.startsWith('data:')) {
  const dataUrlMatch = fileId.match(/^data:([^;]+);base64,(.+)$/)
  if (!dataUrlMatch) {
    return createValidationError('Invalid data URL format')
  }

  const [, mimeType, base64Content] = dataUrlMatch
  const uploadResult = await file.upload({
    content: base64Content,
    name: `lab_report_${Date.now()}.pdf`,
    mimeType,
  })
  fileId = uploadResult.id
}
```

### File metadata

```ts
const fileInfo = await file.get(fileId)
const sourceName = fileInfo.name
```

---

## `ai.generateObject`

Structured extraction with a Zod schema. Returns typed objects — no manual JSON parsing.

### Basic call (file input)

```ts
import { ai } from 'skedyul'

const result = await ai.generateObject({
  model: 'google/gemini-2.5-pro',
  system: PHASE1_EXTRACTION_PROMPT,
  prompt: 'Extract metadata and test codes. Do NOT extract individual test results.',
  files: [fileId],
  schema: Phase1Schema,
})
```

### Text input (no file)

```ts
const result = await ai.generateObject({
  model: 'openai/gpt-5-mini',
  system: TEXT_PARSING_SYSTEM_PROMPT,
  prompt: `Parse the following lab report:\n\n${textContent}`,
  schema: ParsedLabReportSchema,
})
```

### Parameters

| Param | Purpose |
|-------|---------|
| `model` | Provider/model string (`google/gemini-2.5-pro`, `openai/gpt-5-mini`, etc.) |
| `system` | System prompt — role, constraints, output rules |
| `prompt` | User message / task description |
| `files` | Array of file IDs for multimodal models |
| `schema` | Zod schema — defines and validates output shape |

---

## Two-phase extraction (Vetnostics)

Single-pass extraction struggles with large panels. Vetnostics splits into focused phases:

### Phase 1 — detect codes and metadata

```ts
phase1Result = await ai.generateObject({
  model,
  system: PHASE1_EXTRACTION_PROMPT,
  prompt: 'Extract metadata, test codes, and interpretive content. Do NOT extract individual test results.',
  files: [fileId],
  schema: Phase1Schema,
})

const detectedCodes = phase1Result.test_codes?.map(tc => tc.code) ?? []
```

`Phase1Schema` captures lab ref, dates, patient info, and test code list — not analyte values.

### Phase 2 — per-code specialized extraction

For each detected code, use region-specific config or generic fallback:

```ts
for (const code of detectedCodes) {
  const config = getTestCodeConfig(code, region)

  if (config?.tests?.length > 0) {
    codeResults = await parseWithTestCodeAndModel({ type: 'file', fileId }, code, config, model)
  } else {
    codeResults = await parseWithGenericPromptAndModel(fileId, code, testName, model)
  }
}
```

Specialized prompts include **exact field names** from test code configs (`regions/au/vic/test_codes/622/`), improving accuracy over a single giant schema.

### Microbiology branch

Pure microbiology reports route to a dedicated extractor:

```ts
const microExtracted = await ai.generateObject({
  model,
  system: MICROBIOLOGY_EXTRACTION_PROMPT,
  prompt: 'Extract culture and sensitivity results...',
  files: [fileId],
  schema: MicrobiologyReportSchema,
})
```

### Fuzzy name matching (cheap model)

When analyte names don't match config codes, a lightweight model maps names:

```ts
const result = await ai.generateObject({
  model: 'openai/gpt-5-nano',
  system: 'You are a veterinary lab test name matcher...',
  prompt: `Match these test names to codes: ${unmatchedInfo}`,
  schema: FuzzyMatchSchema,
})
```

Use cheaper models for simple classification; reserve `gemini-2.5-pro` for document vision.

---

## Deterministic fallback

Before calling AI on text, check for known HTML formats:

```ts
if (isVetnosticsHTML(textContent)) {
  return parseVetnosticsHTML(textContent, sourceName)
}
```

Prefer deterministic parsers when the input format is predictable — faster, cheaper, reproducible.

---

## Model selection

Vetnostics chooses models by input type:

| Input | Model | Rationale |
|-------|-------|-----------|
| PDF (`file_id`) | `google/gemini-2.5-pro` | Strong multimodal PDF understanding |
| Text/HTML | `openai/gpt-5-mini` | Fast text extraction |
| Fuzzy matching | `openai/gpt-5-nano` | Cheap classification |

Pass model via options so tests can override:

```ts
export async function parseLabReportTwoPhase(
  fileId: string,
  fileName: string,
  options: { model?: string; region?: string } = {},
): Promise<ParsedLabReport> {
  const model = options.model ?? 'google/gemini-2.5-pro'
  // ...
}
```

---

## Tool configuration for AI workloads

```ts
export const parseLabReportRegistry: ToolDefinition<...> = {
  name: 'parse_lab_report',
  timeout: 600000,    // 10 minutes — multiple AI calls
  retries: 3,         // transient model/provider failures
  handler: async (input, _context) => { /* ... */ },
}
```

AI tools need generous timeouts. Multiple `generateObject` calls in one handler can exceed default limits.

---

## Output mapping

Map internal `AnalyteResult` types to the tool output schema:

```ts
function mapAnalyteResult(result: AnalyteResult, panelCode: string, index: number) {
  const { column, row } = getLayoutPosition(result.test_code, panelCode, result.discipline, index)
  return {
    test_name: testDef?.name ?? result.test_name,
    test_code: result.test_code,
    value_string: result.value,
    value_number: parseNumericValue(result.value),
    display_order: row,
    cell_column: column,
    verified: result.verified,
    // ...
  }
}
```

Keep Zod `outputSchema` as the contract for workflows. Internal lib types can differ.

---

## Error handling

```ts
try {
  phase1Result = await ai.generateObject({ /* ... */ })
} catch (error) {
  throw new Error(`Phase 1 extraction failed: ${error.message}`)
}

// Tool handler top level:
catch (error) {
  return createExternalError('Vetnostics', error.message)
}
```

Per-code extraction failures are logged and skipped — partial results beat total failure:

```ts
} catch (error) {
  console.error(`Extraction failed for ${code}: ${error.message}`)
}
```

---

## Patterns summary

| Pattern | When |
|---------|------|
| `file.upload` + `files: [id]` | PDF/image document parsing |
| `ai.generateObject` + Zod schema | Any structured extraction |
| Multi-phase extraction | Large documents with many fields |
| Per-domain specialized schemas | Known formats with config registries |
| Cheap model for classification | Name matching, routing decisions |
| Deterministic parser first | Known HTML/text formats |
| Parse-only tool | Let workflows handle CRM persistence |

---

## Related docs

- [Provision-only app](./provision-only-app.md) — Vetnostics minimal structure
- [Core API](../core-api.md) — `file.upload`, `file.get`, `ai.generateObject`
- [Tools](../tools.md) — timeouts, retries, response helpers
- [Estimation and billing](../estimation-and-billing.md) — cost estimates for billable tools
