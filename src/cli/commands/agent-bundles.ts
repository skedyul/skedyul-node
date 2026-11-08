import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { parseArgs } from '../utils'
import { callCliApi, getCredentials, getServerUrl } from '../utils/auth'

/**
 * `skedyul agents bundle` — send a workplace-agents package to its workplace.
 *
 * A bundle is one folder with manifest.yml and agents/<handle>/ and
 * skills/<handle>/ folders (the app document-tree layout), plus optional
 * crm/. The manifest names the one workplace it is for. Each deploy is
 * recorded as a Deployment on that workplace.
 */

interface WorkplaceTokenResponse {
  workplaceId: string
  workplaceSubdomain: string
}

interface BundleDeployment {
  id: string
  status: string
  bundle: {
    handle: string
    name: string
    version: string
    contentHash: string
    withCrm: boolean
  } | null
  gitRepository: string | null
  gitCommitSha: string | null
  gitRef: string | null
  projectDirectory: string | null
  result:
    | {
        skills: Array<{ handle: string; version: number; reused: boolean }>
        agents: Array<{ handle: string; version: number | null; reused: boolean; promoted: boolean }>
        crm: null | {
          applied: boolean
          hasChanges: boolean
          seeds: Array<{ path: string; model: string; created: number; updated: number }>
        }
        warnings: string[]
      }
    | { error: string }
    | null
  createdAt: string
}

interface PrepareResponse {
  uploadKey: string
  uploadUrl: string
  maxBytes: number
}

function printHelp(): void {
  console.log(`
skedyul agents bundle - Deploy a workplace-agents package to its workplace

A bundle is one folder with manifest.yml, agents/<handle>/ and skills/<handle>/
folders (the app document-tree layout), and an optional crm/ (schema + seeds).
manifest.yml names the one workplace it is for. Each deploy is recorded as a
Deployment on that workplace.

Usage:
  skedyul agents bundle <command> [options]

Commands:
  deploy              Send a bundle folder or archive to its workplace
  history             List a workplace's bundle deploys

Deploy Options:
  --dir, -d           Bundle folder (packed with the system tar). Git commit,
                      repo, ref, and folder are read from the checkout.
  --archive, -a       A .tar.gz or .zip of the bundle folder
  --workplace, -w     Workplace subdomain (required, must match manifest.yml)
  --with-crm          Also apply crm/schema.json and seeds. Off by default.
  --git-repo          Override: owner/name (default: origin, or $GITHUB_REPOSITORY)
  --git-sha           Override: commit SHA (default: HEAD, or $GITHUB_SHA)
  --git-ref           Override: tag or branch (default: tag at HEAD, else branch)
  --json              Output as JSON

History Options:
  --workplace, -w     Workplace subdomain (required)
  --handle            Only this package (e.g. utg)
  --json              Output as JSON

Auth:
  Uses the active 'skedyul auth login' profile, or SKEDYUL_CLI_TOKEN (and
  optional SKEDYUL_SERVER_URL) when set.

Examples:
  skedyul agents bundle deploy --dir ./packages/utg --workplace united-training
  skedyul agents bundle deploy --dir ./packages/utg --workplace united-training --with-crm
  skedyul agents bundle deploy --archive ./aaps.zip --workplace aaps
  skedyul agents bundle history --workplace united-training

  Roll back by checking out the older commit or tag and deploying it again.
`)
}

function ensureAuth(): { token: string; serverUrl: string } {
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

function git(dir: string, args: string[]): string | undefined {
  try {
    return execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || undefined
  } catch {
    return undefined
  }
}

/** owner/name from an https or ssh GitHub remote. */
function repoFromRemote(url: string | undefined): string | undefined {
  if (!url) return undefined
  const match = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/)
  return match?.[1]
}

type Provenance = {
  repository?: string
  commitSha?: string
  ref?: string
  message?: string
  projectDirectory?: string
  dirty: boolean
}

function readProvenance(dir: string | undefined, flags: Record<string, string | boolean>): Provenance {
  const fromGit: Provenance = { dirty: false }
  if (dir && git(dir, ['rev-parse', '--is-inside-work-tree']) === 'true') {
    fromGit.commitSha = git(dir, ['rev-parse', 'HEAD'])
    fromGit.repository = repoFromRemote(git(dir, ['remote', 'get-url', 'origin']))
    fromGit.ref =
      git(dir, ['describe', '--tags', '--exact-match', 'HEAD']) ??
      git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])
    fromGit.message = git(dir, ['log', '-1', '--pretty=%s'])
    const prefix = git(dir, ['rev-parse', '--show-prefix'])
    fromGit.projectDirectory = prefix ? prefix.replace(/\/$/, '') : undefined
    fromGit.dirty = Boolean(git(dir, ['status', '--porcelain', '--', '.']))
  }
  return {
    repository: str(flags['git-repo']) ?? fromGit.repository ?? str(process.env.GITHUB_REPOSITORY),
    commitSha: str(flags['git-sha']) ?? fromGit.commitSha ?? str(process.env.GITHUB_SHA),
    ref: str(flags['git-ref']) ?? fromGit.ref ?? str(process.env.GITHUB_REF_NAME),
    message: fromGit.message,
    projectDirectory: fromGit.projectDirectory,
    dirty: fromGit.dirty,
  }
}

function packDir(dir: string): string {
  const root = path.resolve(dir)
  if (!fs.existsSync(path.join(root, 'manifest.yml'))) {
    throw new Error(`${root} has no manifest.yml`)
  }
  const out = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'skedyul-bundle-')),
    'bundle.tar.gz',
  )
  // COPYFILE_DISABLE stops macOS tar from adding ._ AppleDouble files.
  execFileSync('tar', ['-czf', out, '-C', root, '.'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  })
  return out
}

function printDeployment(d: BundleDeployment): void {
  const b = d.bundle
  console.log(`  Deployment: ${d.id} (${d.status})`)
  if (b) console.log(`  Bundle:     ${b.handle}@${b.version} (${b.contentHash.slice(0, 12)})`)
  if (d.gitCommitSha) {
    console.log(
      `  Source:     ${d.gitRepository ?? 'git'}@${d.gitCommitSha.slice(0, 7)}${d.gitRef ? ` (${d.gitRef})` : ''}${d.projectDirectory ? ` ${d.projectDirectory}` : ''}`,
    )
  }
  const r = d.result
  if (!r) return
  if ('error' in r) {
    console.log(`  Error:      ${r.error}`)
    return
  }
  if (r.crm) {
    console.log(`  CRM schema: ${r.crm.applied ? (r.crm.hasChanges ? 'applied' : 'no changes') : 'none'}`)
    for (const seed of r.crm.seeds) {
      console.log(`  Seed ${seed.path}: ${seed.created} created, ${seed.updated} updated (${seed.model})`)
    }
  }
  for (const s of r.skills) console.log(`  Skill ${s.handle}: v${s.version}${s.reused ? ' (unchanged)' : ''}`)
  for (const a of r.agents) {
    const note = a.promoted ? ' (existing version, now live)' : a.reused ? ' (unchanged)' : ''
    console.log(`  Agent ${a.handle}: v${a.version ?? '?'}${note}`)
  }
  for (const w of r.warnings) console.log(`  Warning: ${w}`)
}

async function handleDeploy(args: string[]): Promise<void> {
  const { flags } = parseArgs(args)
  const json = Boolean(flags.json)
  const archive = str(flags.archive) ?? str(flags.a)
  const dir = str(flags.dir) ?? str(flags.d)
  const workplace = str(flags.workplace) ?? str(flags.w)
  const withCrm = Boolean(flags['with-crm'])

  if (!archive && !dir) fail('--dir or --archive is required', json)
  if (archive && dir) fail('Pass --dir or --archive, not both', json)
  if (!workplace) fail('--workplace (-w) is required. It must match workplace in manifest.yml.', json)

  let archivePath: string
  try {
    archivePath = archive ? path.resolve(archive) : packDir(dir as string)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), json)
  }
  if (!fs.existsSync(archivePath)) fail(`Archive not found: ${archivePath}`, json)
  const bytes = fs.readFileSync(archivePath)
  const provenance = readProvenance(dir ? path.resolve(dir) : undefined, flags)

  const { token, serverUrl } = ensureAuth()
  const api = { serverUrl, token }

  try {
    const wp = await callCliApi<WorkplaceTokenResponse>(api, '/workplace-token', {
      workplaceSubdomain: workplace,
    })
    if (!json) {
      console.log('')
      console.log(`Deploying ${dir ?? archive} to ${wp.workplaceSubdomain}${withCrm ? ' (with CRM)' : ''}`)
      if (provenance.dirty) {
        console.log('  Warning: the folder has uncommitted changes. The deploy records HEAD, not those edits.')
      }
    }
    const prepare = await callCliApi<PrepareResponse>(api, '/agent-bundles', { action: 'prepare' })
    if (bytes.length > prepare.maxBytes) {
      throw new Error(`Archive is ${bytes.length} bytes; the limit is ${prepare.maxBytes}`)
    }
    const put = await fetch(prepare.uploadUrl, { method: 'PUT', body: bytes })
    if (!put.ok) throw new Error(`Archive upload failed: ${put.status} ${put.statusText}`)

    const git = provenance.commitSha
      ? {
          commitSha: provenance.commitSha,
          ...(provenance.repository ? { repository: provenance.repository } : {}),
          ...(provenance.ref ? { ref: provenance.ref } : {}),
          ...(provenance.message ? { message: provenance.message } : {}),
        }
      : undefined
    const result = await callCliApi<{ deployment: BundleDeployment }>(api, '/agent-bundles', {
      action: 'deploy',
      workplaceId: wp.workplaceId,
      uploadKey: prepare.uploadKey,
      withCrm,
      ...(git ? { git } : {}),
      ...(provenance.projectDirectory ? { projectDirectory: provenance.projectDirectory } : {}),
    })

    if (json) {
      console.log(JSON.stringify(result.deployment, null, 2))
      return
    }
    printDeployment(result.deployment)
    console.log('')
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), json)
  }
}

async function handleHistory(args: string[]): Promise<void> {
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
    const result = await callCliApi<{ deployments: BundleDeployment[] }>(
      api,
      '/agent-bundles',
      undefined,
      { method: 'GET', query: { workplaceId: wp.workplaceId, handle: str(flags.handle) } },
    )
    if (json) {
      console.log(JSON.stringify(result.deployments, null, 2))
      return
    }
    if (result.deployments.length === 0) {
      console.log(`${wp.workplaceSubdomain} has no bundle deploys.`)
      return
    }
    for (const d of result.deployments) {
      const b = d.bundle
      const source = d.gitCommitSha ? `${d.gitCommitSha.slice(0, 7)}${d.gitRef ? ` ${d.gitRef}` : ''}` : 'upload'
      console.log(
        `${d.createdAt}\t${d.status}\t${b ? `${b.handle}@${b.version}` : '?'}\t${source}${b?.withCrm ? '\twith CRM' : ''}`,
      )
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), json)
  }
}

export async function agentBundlesCommand(args: string[]): Promise<void> {
  const subcommand = args[0]
  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    printHelp()
    return
  }
  const rest = args.slice(1)
  switch (subcommand) {
    case 'deploy':
      await handleDeploy(rest)
      break
    case 'history':
      await handleHistory(rest)
      break
    default:
      console.error(`Error: Unknown subcommand: bundle ${subcommand}`)
      console.error("Run 'skedyul agents bundle --help' for usage information.")
      process.exit(1)
  }
}
