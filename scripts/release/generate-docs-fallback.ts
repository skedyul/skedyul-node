#!/usr/bin/env tsx
import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import { docsForChangedFiles } from './doc-map'

interface CliArgs {
  base: string
  head: string
  version: string
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  const parsed: Partial<CliArgs> = {}

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--base':
        parsed.base = args[++i]
        break
      case '--head':
        parsed.head = args[++i]
        break
      case '--version':
        parsed.version = args[++i]
        break
    }
  }

  if (!parsed.base || !parsed.head || !parsed.version) {
    throw new Error('Usage: generate-docs-fallback.ts --base <sha> --head <sha> --version <semver>')
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

function updateReadmeVersion(version: string): void {
  if (!fs.existsSync('README.md')) return
  let content = fs.readFileSync('README.md', 'utf8')
  if (/\*\*Version:\*\*/i.test(content)) {
    content = content.replace(/\*\*Version:\*\*[^\n]*/i, `**Version:** ${version} *(prerelease)*`)
  }
  fs.writeFileSync('README.md', content, 'utf8')
}

function appendDocsSummary(changedFiles: string[], base: string, head: string, version: string): void {
  const targetDocs = docsForChangedFiles(changedFiles)
  const commits = safeRun(`git log --format='- %h %s' ${base}..${head}`).split('\n').filter(Boolean).slice(0, 10)
  const summary = [
    '',
    '<!-- auto-generated docs summary -->',
    '',
    '## Recent SDK changes (automated summary)',
    '',
    `Prerelease \`${version}\`. Copilot was unavailable; this section was generated from git metadata.`,
    '',
    '### Commits',
    '',
    commits.length > 0 ? commits.join('\n') : '- No commits in range',
    '',
    '### Affected docs to review',
    '',
    ...targetDocs.map((doc) => `- [ ] \`${doc}\``),
    '',
  ].join('\n')

  const docsReadme = 'docs/README.md'
  if (!fs.existsSync(docsReadme)) return
  let content = fs.readFileSync(docsReadme, 'utf8')
  content = content.replace(/\n<!-- auto-generated docs summary -->[\s\S]*$/m, '')
  fs.writeFileSync(docsReadme, `${content.trimEnd()}${summary}\n`, 'utf8')
}

function main(): void {
  const args = parseArgs()
  const changedFiles = safeRun(`git diff --name-only ${args.base}..${args.head}`).split('\n').filter(Boolean)
  updateReadmeVersion(args.version)
  appendDocsSummary(changedFiles, args.base, args.head, args.version)
}

main()
