#!/usr/bin/env tsx
import { execSync } from 'node:child_process'
import { compareStable, isStableVersion, parseSemVer, tagName } from './semver'

export interface StableTagInfo {
  stableVersion: string | null
  stableTag: string | null
  stableSha: string | null
}

function safeRun(command: string): string {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return ''
  }
}

export function resolveLatestStableTag(): StableTagInfo {
  const tags = safeRun('git tag -l "v*" --sort=-v:refname').split('\n').filter(Boolean)

  for (const tag of tags) {
    const version = tag.replace(/^v/, '')
    if (!isStableVersion(version)) continue
    const sha = safeRun(`git rev-list -n 1 ${tag}`)
    return { stableVersion: version, stableTag: tag, stableSha: sha || null }
  }

  const packageVersion = safeRun("node -p \"require('./package.json').version\"")
  const parsed = parseSemVer(packageVersion)
  if (parsed && isStableVersion(packageVersion)) {
    return { stableVersion: packageVersion, stableTag: tagName(packageVersion), stableSha: null }
  }

  return { stableVersion: null, stableTag: null, stableSha: null }
}

function main(): void {
  const json = process.argv.includes('--json')
  const info = resolveLatestStableTag()
  if (json) {
    process.stdout.write(`${JSON.stringify(info)}\n`)
  } else {
    console.log(`stableVersion=${info.stableVersion ?? ''}`)
    console.log(`stableTag=${info.stableTag ?? ''}`)
  }
}

if (require.main === module) main()
