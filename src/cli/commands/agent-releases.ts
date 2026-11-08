import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { parseArgs } from '../utils'
import { callCliApi, getCredentials, getServerUrl } from '../utils/auth'

/**
 * `skedyul agents release` — managed agent bundles.
 *
 * A release is one archive (manifest.yml + agents + skills + crm) that is
 * published once and is immutable. Publishing never changes a workplace.
 * `deploy` applies one release to one named workplace.
 */

interface WorkplaceTokenResponse {
  workplaceId: string
  workplaceSubdomain: string
}

interface ReleaseSummary {
  id: string
  handle: string
  name: string
  version: string
  contentHash: string
  sourceType: 'GIT' | 'UPLOAD'
  gitRepository: string | null
  gitCommitSha: string | null
  gitRef: string | null
  publishedByEmail: string | null
  createdAt: string
  agents: string[]
  skills: string[]
  hasCrm: boolean
}

interface PinSummary {
  id: string
  handle: string
  release: { id: string; version: string; contentHash: string }
  withCrm: boolean
  createdAt: string
  isCurrent: boolean
}

interface PrepareResponse {
  uploadKey: string
  uploadUrl: string
  maxBytes: number
}

interface RegisterResponse {
  release: ReleaseSummary
  existing: boolean
  warnings: string[]
}

interface DeployResponse {
  pin: PinSummary
  release: ReleaseSummary
  skills: Array<{ path: string; handle: string; version: number; reused: boolean }>
  agents: Array<{
    path: string
    handle: string
    version: number | null
    reused: boolean
    promoted: boolean
  }>
  crm: null | {
    applied: boolean
    hasChanges: boolean
    migrationId: string | null
    seeds: Array<{ path: string; model: string; created: number; updated: number }>
  }
  warnings: string[]
}

function printHelp(): void {
  console.log(`
skedyul agents release - Publish and deploy managed agent bundles

A bundle is one folder with manifest.yml, agents/<handle>/ and skills/<handle>/
folders (the app document-tree layout), and an optional
crm/ (schema + seeds), shipped as a single .tar.gz or .zip. Publishing records
an immutable release. Only deploy changes a workplace, and it always names one.

Usage:
  skedyul agents release <command> [options]

Commands:
  publish             Upload an archive (or pack a folder) as a release
  deploy <ref>        Apply handle@version to one workplace
  list                List published releases
  status              Show which release each package is pinned to on a workplace

Publish Options:
  --archive, -a       Path to a .tar.gz or .zip bundle
  --dir, -d           Bundle folder to pack (uses the system tar)
  --git-repo          Provenance: owner/name (default: $GITHUB_REPOSITORY)
  --git-sha           Provenance: commit SHA (default: $GITHUB_SHA)
  --git-ref           Provenance: tag or branch (default: $GITHUB_REF_NAME)
  --json              Output as JSON

Deploy Options:
  --workplace, -w     Workplace subdomain (required)
  --with-crm          Also apply crm/schema.json and seeds. Off by default.
  --json              Output as JSON

List Options:
  --handle            Only this package (e.g. utg)
  --json              Output as JSON

Auth:
  Uses the active 'skedyul auth login' profile, or SKEDYUL_CLI_TOKEN (and
  optional SKEDYUL_SERVER_URL) when set, for CI.

Status Options:
  --workplace, -w     Workplace subdomain (required)
  --handle            Only this package
  --json              Output as JSON

Examples:
  skedyul agents release publish --archive ./utg.tar.gz
  skedyul agents release publish --dir ./packages/utg
  skedyul agents release deploy utg@1.0.0 --workplace united-training
  skedyul agents release deploy utg@1.0.0 --workplace united-training --with-crm
  skedyul agents release status --workplace united-training

  Rollback is a deploy of an older release:
  skedyul agents release deploy utg@0.9.0 --workplace united-training
`)
}

function ensureAuth(): { token: string; serverUrl: string } {
  // CI (the workplace-agents publish workflow) has no profile on disk.
  const envToken = process.env.SKEDYUL_CLI_TOKEN
  if (envToken) {
    return {
      token: envToken,
      serverUrl: process.env.SKEDYUL_SERVER_URL || getServerUrl(),
    }
  }
  const credentials = getCredentials()
  if (!credentials?.token) {
    console.error('Error: Not authenticated')
    console.error("Run 'skedyul auth login' to authenticate first.")
    process.exit(1)
  }
  return { token: credentials.token, serverUrl: getServerUrl() }
}

function fail(message: string, json: boolean): never {
  if (json) {
    console.log(JSON.stringify({ error: message }))
  } else {
    console.error(`Error: ${message}`)
  }
  process.exit(1)
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function packDir(dir: string): string {
  const root = path.resolve(dir)
  if (!fs.existsSync(path.join(root, 'manifest.yml'))) {
    throw new Error(`${root} has no manifest.yml`)
  }
  const out = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'skedyul-release-')),
    'bundle.tar.gz',
  )
  // COPYFILE_DISABLE stops macOS tar from adding ._ AppleDouble files.
  execFileSync('tar', ['-czf', out, '-C', root, '.'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  })
  return out
}

async function handlePublish(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)
  const json = Boolean(flags.json)
  const archive = str(flags.archive) ?? str(flags.a)
  const dir = str(flags.dir) ?? str(flags.d)

  if (!archive && !dir) fail('--archive or --dir is required', json)
  if (archive && dir) fail('Pass --archive or --dir, not both', json)

  let archivePath: string
  try {
    archivePath = archive ? path.resolve(archive) : packDir(dir as string)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), json)
  }
  if (!fs.existsSync(archivePath)) fail(`Archive not found: ${archivePath}`, json)
  const bytes = fs.readFileSync(archivePath)

  const commitSha = str(flags['git-sha']) ?? str(process.env.GITHUB_SHA)
  const git = commitSha
    ? {
        commitSha,
        repository: str(flags['git-repo']) ?? str(process.env.GITHUB_REPOSITORY),
        ref: str(flags['git-ref']) ?? str(process.env.GITHUB_REF_NAME),
      }
    : undefined

  const { token, serverUrl } = ensureAuth()
  const api = { serverUrl, token }

  try {
    const prepare = await callCliApi<PrepareResponse>(api, '/agent-releases', {
      action: 'prepare',
    })
    if (bytes.length > prepare.maxBytes) {
      throw new Error(`Archive is ${bytes.length} bytes; the limit is ${prepare.maxBytes}`)
    }
    const put = await fetch(prepare.uploadUrl, { method: 'PUT', body: bytes })
    if (!put.ok) {
      throw new Error(`Archive upload failed: ${put.status} ${put.statusText}`)
    }
    const result = await callCliApi<RegisterResponse>(api, '/agent-releases', {
      action: 'register',
      uploadKey: prepare.uploadKey,
      ...(git ? { git } : {}),
    })

    if (json) {
      console.log(JSON.stringify(result, null, 2))
      return
    }
    const r = result.release
    console.log('')
    console.log(
      result.existing
        ? `Release ${r.handle}@${r.version} already exists with the same content.`
        : `Published ${r.handle}@${r.version} (${r.name}).`,
    )
    console.log(`  Release:  ${r.id}`)
    console.log(`  Hash:     ${r.contentHash}`)
    console.log(`  Agents:   ${r.agents.join(', ') || '(none)'}`)
    console.log(`  Skills:   ${r.skills.join(', ') || '(none)'}`)
    console.log(`  CRM:      ${r.hasCrm ? 'included (deploy with --with-crm to apply)' : 'none'}`)
    if (r.gitCommitSha) {
      console.log(`  Source:   ${r.gitRepository ?? 'git'}@${r.gitCommitSha}${r.gitRef ? ` (${r.gitRef})` : ''}`)
    }
    for (const warning of result.warnings) console.log(`  Warning:  ${warning}`)
    console.log('')
    console.log('No workplace changed. Deploy with:')
    console.log(`  skedyul agents release deploy ${r.handle}@${r.version} --workplace <subdomain>`)
    console.log('')
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), json)
  }
}

async function handleDeploy(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args)
  const json = Boolean(flags.json)
  const ref = positional[0]
  const workplace = str(flags.workplace) ?? str(flags.w)
  const withCrm = Boolean(flags['with-crm'])

  if (!ref) fail('Release is required, e.g. utg@1.0.0', json)
  if (!workplace) fail('--workplace (-w) is required. Deploy always names one workplace.', json)

  const { token, serverUrl } = ensureAuth()
  const api = { serverUrl, token }

  try {
    const wp = await callCliApi<WorkplaceTokenResponse>(api, '/workplace-token', {
      workplaceSubdomain: workplace,
    })
    if (!json) {
      console.log('')
      console.log(`Deploying ${ref} to ${wp.workplaceSubdomain}${withCrm ? ' (with CRM)' : ''}`)
    }
    const result = await callCliApi<DeployResponse>(api, '/agent-releases', {
      action: 'deploy',
      workplaceId: wp.workplaceId,
      release: ref,
      withCrm,
    })

    if (json) {
      console.log(JSON.stringify(result, null, 2))
      return
    }
    if (result.crm) {
      console.log(
        `  CRM schema: ${result.crm.applied ? (result.crm.hasChanges ? 'applied' : 'no changes') : 'none'}`,
      )
      for (const seed of result.crm.seeds) {
        console.log(`  Seed ${seed.path}: ${seed.created} created, ${seed.updated} updated (${seed.model})`)
      }
    }
    for (const skill of result.skills) {
      console.log(`  Skill ${skill.handle}: v${skill.version}${skill.reused ? ' (unchanged)' : ''}`)
    }
    for (const agent of result.agents) {
      const note = agent.promoted ? ' (existing version, now live)' : agent.reused ? ' (unchanged)' : ''
      console.log(`  Agent ${agent.handle}: v${agent.version ?? '?'}${note}`)
    }
    for (const warning of result.warnings) console.log(`  Warning: ${warning}`)
    console.log('')
    console.log(`${wp.workplaceSubdomain} is now pinned to ${result.release.handle}@${result.release.version}.`)
    console.log('')
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), json)
  }
}

async function handleList(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)
  const json = Boolean(flags.json)
  const { token, serverUrl } = ensureAuth()
  try {
    const result = await callCliApi<{ releases: ReleaseSummary[] }>(
      { serverUrl, token },
      '/agent-releases',
      undefined,
      { method: 'GET', query: { handle: str(flags.handle) } },
    )
    if (json) {
      console.log(JSON.stringify(result.releases, null, 2))
      return
    }
    if (result.releases.length === 0) {
      console.log('No releases.')
      return
    }
    for (const r of result.releases) {
      const source = r.gitCommitSha ? `git ${r.gitCommitSha.slice(0, 7)}` : 'upload'
      console.log(`${r.handle}@${r.version}\t${r.createdAt}\t${source}\t${r.contentHash.slice(0, 12)}`)
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), json)
  }
}

async function handleStatus(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)
  const json = Boolean(flags.json)
  const workplace = str(flags.workplace) ?? str(flags.w)
  if (!workplace) fail('--workplace (-w) is required', json)
  const { token, serverUrl } = ensureAuth()
  const api = { serverUrl, token }
  try {
    const wp = await callCliApi<WorkplaceTokenResponse>(api, '/workplace-token', {
      workplaceSubdomain: workplace,
    })
    const result = await callCliApi<{ pins: PinSummary[] }>(
      api,
      '/agent-releases',
      undefined,
      { method: 'GET', query: { workplaceId: wp.workplaceId, handle: str(flags.handle) } },
    )
    if (json) {
      console.log(JSON.stringify(result.pins, null, 2))
      return
    }
    if (result.pins.length === 0) {
      console.log(`${wp.workplaceSubdomain} has no managed agent releases.`)
      return
    }
    for (const pin of result.pins) {
      const marker = pin.isCurrent ? '*' : ' '
      console.log(
        `${marker} ${pin.handle}@${pin.release.version}\t${pin.createdAt}${pin.withCrm ? '\twith CRM' : ''}`,
      )
    }
    console.log('')
    console.log('* = live pin')
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), json)
  }
}

export async function agentReleasesCommand(args: string[]): Promise<void> {
  const subcommand = args[0]
  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    printHelp()
    return
  }
  const rest = args.slice(1)
  switch (subcommand) {
    case 'publish':
      await handlePublish(rest)
      break
    case 'deploy':
      await handleDeploy(rest)
      break
    case 'list':
      await handleList(rest)
      break
    case 'status':
      await handleStatus(rest)
      break
    default:
      console.error(`Error: Unknown subcommand: release ${subcommand}`)
      console.error("Run 'skedyul agents release --help' for usage information.")
      process.exit(1)
  }
}
