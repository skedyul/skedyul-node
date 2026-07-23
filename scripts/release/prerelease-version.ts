#!/usr/bin/env tsx
import * as fs from 'node:fs'
import * as path from 'node:path'
import { nextPrereleaseVersion, tagName } from './semver'
import { resolveLatestStableTag } from './resolve-stable-tag'

interface CliArgs {
  prNumber: number
  packageJsonPath: string
  outputJson?: string
  write: boolean
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  const parsed: Partial<CliArgs> = {
    packageJsonPath: 'package.json',
    write: false,
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--pr-number':
        parsed.prNumber = Number.parseInt(args[++i] ?? '', 10)
        break
      case '--package-json':
        parsed.packageJsonPath = args[++i]
        break
      case '--output-json':
        parsed.outputJson = args[++i]
        break
      case '--write':
        parsed.write = true
        break
    }
  }

  if (!parsed.prNumber || !Number.isFinite(parsed.prNumber)) {
    throw new Error('Usage: prerelease-version.ts --pr-number <n> [--write] [--package-json path]')
  }

  return parsed as CliArgs
}

function updateReadmeVersion(readmePath: string, version: string): boolean {
  if (!fs.existsSync(readmePath)) return false
  const content = fs.readFileSync(readmePath, 'utf8')
  const updated = content.replace(
    /\*\*Version:\*\*[^\n]*/i,
    `**Version:** ${version} *(prerelease on PR branch)*`,
  )
  if (updated === content) return false
  fs.writeFileSync(readmePath, updated, 'utf8')
  return true
}

function main(): void {
  const args = parseArgs()
  const stable = resolveLatestStableTag()
  const stableVersion = stable.stableVersion ?? '0.0.0'

  const pkgPath = path.resolve(args.packageJsonPath)
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version: string }
  const nextVersion = nextPrereleaseVersion({
    stableVersion,
    currentVersion: pkg.version,
    prNumber: args.prNumber,
  })

  const result = {
    stableVersion,
    previousVersion: pkg.version,
    nextVersion,
    tag: tagName(nextVersion),
  }

  if (args.write) {
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
