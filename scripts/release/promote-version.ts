#!/usr/bin/env tsx
import * as fs from 'node:fs'
import * as path from 'node:path'
import { bumpStable, tagName } from './semver'
import { resolveLatestStableTag } from './resolve-stable-tag'

interface CliArgs {
  bumpType: 'patch' | 'minor'
  packageJsonPath: string
  write: boolean
  outputJson?: string
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  const parsed: Partial<CliArgs> = {
    packageJsonPath: 'package.json',
    write: false,
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--bump-type':
        parsed.bumpType = args[++i] as 'patch' | 'minor'
        break
      case '--package-json':
        parsed.packageJsonPath = args[++i]
        break
      case '--write':
        parsed.write = true
        break
      case '--output-json':
        parsed.outputJson = args[++i]
        break
    }
  }

  if (parsed.bumpType !== 'patch' && parsed.bumpType !== 'minor') {
    throw new Error('Usage: promote-version.ts --bump-type patch|minor [--write]')
  }

  return parsed as CliArgs
}

function updateReadmeVersion(readmePath: string, version: string): void {
  if (!fs.existsSync(readmePath)) return
  const content = fs.readFileSync(readmePath, 'utf8')
  const updated = content.replace(/\*\*Version:\*\*[^\n]*/i, `**Version:** ${version}`)
  fs.writeFileSync(readmePath, updated, 'utf8')
}

function main(): void {
  const args = parseArgs()
  const stable = resolveLatestStableTag()
  const base = stable.stableVersion ?? '0.0.0'
  const nextVersion = bumpStable(base, args.bumpType)

  const result = {
    stableVersion: base,
    bumpType: args.bumpType,
    nextVersion,
    tag: tagName(nextVersion),
  }

  if (args.write) {
    const pkgPath = path.resolve(args.packageJsonPath)
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version: string }
    pkg.version = nextVersion
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
    updateReadmeVersion('README.md', nextVersion)
  }

  if (args.outputJson) {
    fs.writeFileSync(args.outputJson, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  }

  process.stdout.write(`${JSON.stringify(result)}\n`)
}

main()
