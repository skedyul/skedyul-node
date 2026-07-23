#!/usr/bin/env tsx
import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  inferClassificationFromChanges,
  renderTemplatedPrBody,
  suggestFallbackPrTitle,
} from './pr-template'

interface CliArgs {
  base: string
  head: string
  outputDir: string
  prNumber?: number
  prTitle?: string
  branchName?: string
  existingBodyFile?: string
  repo?: string
  copilotUnavailable?: boolean
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  const parsed: Partial<CliArgs> = { outputDir: '/tmp/changelog' }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--base':
        parsed.base = args[++i]
        break
      case '--head':
        parsed.head = args[++i]
        break
      case '--output-dir':
        parsed.outputDir = args[++i]
        break
      case '--pr-number':
        parsed.prNumber = Number.parseInt(args[++i] ?? '', 10)
        break
      case '--pr-title':
        parsed.prTitle = args[++i]
        break
      case '--branch-name':
        parsed.branchName = args[++i]
        break
      case '--existing-body-file':
        parsed.existingBodyFile = args[++i]
        break
      case '--repo':
        parsed.repo = args[++i]
        break
      case '--copilot-unavailable':
        parsed.copilotUnavailable = true
        break
    }
  }

  if (!parsed.base || !parsed.head) {
    throw new Error('Usage: generate-pr-template-fallback.ts --base <sha> --head <sha> [...]')
  }

  return parsed as CliArgs
}

function safeRun(command: string): string {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return ''
  }
}

function bucketArea(filePath: string): string {
  if (filePath.startsWith('src/cli/')) return 'cli'
  if (filePath.startsWith('src/server/')) return 'server'
  if (filePath.startsWith('src/core/')) return 'core-api'
  if (filePath.startsWith('src/config/')) return 'configuration'
  if (filePath.startsWith('src/schemas/')) return 'schemas'
  if (filePath.startsWith('src/sequencer/')) return 'sequencer'
  if (filePath.startsWith('src/ratelimit/')) return 'rate-limit'
  if (filePath.startsWith('src/skills/') || filePath.startsWith('src/workflows/')) return 'agents'
  if (filePath.startsWith('src/')) return 'sdk'
  if (filePath.startsWith('docs/')) return 'docs'
  if (filePath.startsWith('.github/') || filePath.startsWith('scripts/')) return 'ci'
  return 'other'
}

function main(): void {
  const args = parseArgs()
  const repo = args.repo ?? process.env.GITHUB_REPOSITORY
  const changedFiles = safeRun(`git diff --name-only ${args.base}..${args.head}`).split('\n').filter(Boolean)
  const commits = safeRun(`git log --format='%h|%s' ${args.base}..${args.head}`)
    .split('\n')
    .filter(Boolean)
    .slice(0, 20)
    .map((line) => {
      const [shortSha, message] = line.split('|')
      return { shortSha: shortSha ?? '', message: message ?? '' }
    })

  const areas = [...new Set(changedFiles.map(bucketArea).filter((a) => a !== 'other'))].sort()
  const existingBody = args.existingBodyFile ? fs.readFileSync(args.existingBodyFile, 'utf8') : undefined
  const classification = inferClassificationFromChanges(
    changedFiles,
    commits.map((c) => c.message),
  )
  const title = suggestFallbackPrTitle({
    prTitle: args.prTitle,
    branchName: args.branchName,
    commits,
    areas,
  })

  const body = renderTemplatedPrBody({
    existingBody,
    prTitle: title,
    branchName: args.branchName,
    baseSha: args.base,
    headSha: args.head,
    compareUrl: repo ? `https://github.com/${repo}/compare/${args.base}...${args.head}` : undefined,
    areas,
    changedFiles,
    commits,
    classification,
    copilotUnavailable: args.copilotUnavailable,
  })

  fs.mkdirSync(args.outputDir, { recursive: true })
  fs.writeFileSync(path.join(args.outputDir, 'pr-title.txt'), `${title}\n`, 'utf8')
  fs.writeFileSync(path.join(args.outputDir, 'pr-body.md'), body, 'utf8')
  fs.writeFileSync(path.join(args.outputDir, 'pr-classification.txt'), `${classification}\n`, 'utf8')
}

main()
