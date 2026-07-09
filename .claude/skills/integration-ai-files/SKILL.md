---
name: integration-ai-files
description: |
  Use when tools need file upload or LLM structured extraction: file.upload, file.get,
  ai.generateObject, multimodal prompts, and Vetnostics-style parsing patterns.
---

# AI & Files

## SDK docs

- `node_modules/skedyul/docs/core-api.md` — `file.*` and `ai.generateObject` sections
- `node_modules/skedyul/docs/tools.md` — long-running tool timeouts

## file.upload()

Upload content and get a `fl_` file ID for AI or storage:

```ts
import { file } from 'skedyul'

// From base64 string (Vetnostics data-URL fallback)
const { id } = await file.upload({
  content: base64Content,       // Buffer or base64 string
  name: 'lab_report.pdf',
  mimeType: 'application/pdf',
  path: 'attachments',          // optional prefix
})

// From Buffer
const { id, url } = await file.upload({
  content: buffer,
  name: 'document.pdf',
  mimeType: 'application/pdf',
})
```

Returns `{ id: string, url: string | null }`.

## file.get() / file.getUrl()

```ts
const info = await file.get(fileId)       // metadata (name, mimeType)
const { url } = await file.getUrl(fileId) // presigned download URL
```

## ai.generateObject()

Structured LLM output with Zod schema:

```ts
import { ai, z } from 'skedyul'

const ParsedReportSchema = z.object({
  lab_ref: z.string().nullable(),
  results: z.array(z.object({
    test_name: z.string(),
    value: z.string(),
    unit: z.string().nullable(),
  })),
})

const result = await ai.generateObject({
  model: 'google/gemini-2.5-pro',   // or 'openai/gpt-5-mini'
  system: 'You parse veterinary lab reports...',
  prompt: 'Extract all test results from this report.',
  files: [fileId],                  // fl_ ID or { fileId, mimeType }
  schema: ParsedReportSchema,
})

// result is typed per schema
```

Optional: `messages`, `files: [{ fileId, mimeType }]` for multimodal input.

## Tool pattern (Vetnostics)

Accept `file_id` (from `file.upload()`) or `content` (text/HTML). Upload data URLs before calling AI. Keep parsing in `src/lib/content_parser.ts`.

## Model selection & timeouts

| Input | Model |
|-------|-------|
| PDF / image | `google/gemini-2.5-pro` |
| Text / HTML | `openai/gpt-5-mini` |

Set `timeout: 600000` and `retries: 3` for AI tools. Vetnostics uses two-phase parsing (detect codes → per-code schemas in `regions/`).

## Reference examples (read-only)

- **Vetnostics** `private-integrations/integrations/vetnostics/src/tools/parse_lab_report.ts` — file upload, model routing
- **Vetnostics** `private-integrations/integrations/vetnostics/src/lib/content_parser.ts` — `ai.generateObject` calls
- **Public integrations** `integrations/integrations/email/` — file attachments in messaging tools

## Anti-patterns

- **Do not edit reference clones**
- **Do not use `workspace:*` for `skedyul`**
- **Only edit `projectDirectory`**
- **Do not pass raw base64/data URLs to `ai.generateObject`** — upload via `file.upload` first
- **Do not use default 10s tool timeout** for AI parsing
- **Do not skip input validation** (`file_id` XOR `content`)
- **Do not parse AI output without a Zod schema** — always use `schema` param
- **Do not sync CRM inside parse tools** — return structured data; let workflows sync (Vetnostics pattern)

## Validate

```bash
pnpm build
# Integration tests: see vetnostics test:integration script pattern
```
