#!/usr/bin/env tsx
import * as fs from 'node:fs'
import { parseClassification, validatePrTemplate } from './pr-template'

function parseArgs(): { bodyFile?: string; json: boolean } {
  const args = process.argv.slice(2)
  let bodyFile: string | undefined
  let json = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--body-file' && args[i + 1]) bodyFile = args[++i]
    else if (args[i] === '--json') json = true
  }

  return { bodyFile, json }
}

function main(): void {
  const { bodyFile, json } = parseArgs()
  if (!bodyFile) {
    console.error('Usage: validate-pr-template.ts --body-file <path> [--json]')
    process.exit(2)
  }

  const body = fs.readFileSync(bodyFile, 'utf8')
  const result = validatePrTemplate(body)

  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`)
    process.exit(0)
  }

  if (!result.compliant && result.reasons.length > 0) {
    for (const reason of result.reasons) console.error(reason)
  }

  process.exit(result.compliant || result.skipped ? 0 : 1)
}

main()
