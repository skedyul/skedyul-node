export interface SemVerParts {
  major: number
  minor: number
  patch: number
  prerelease: string | null
}

export function parseSemVer(version: string): SemVerParts | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/)
  if (!match) return null
  return {
    major: Number.parseInt(match[1] ?? '0', 10),
    minor: Number.parseInt(match[2] ?? '0', 10),
    patch: Number.parseInt(match[3] ?? '0', 10),
    prerelease: match[4] ?? null,
  }
}

export function formatSemVer(parts: SemVerParts): string {
  const base = `${parts.major}.${parts.minor}.${parts.patch}`
  return parts.prerelease ? `${base}-${parts.prerelease}` : base
}

export function isStableVersion(version: string): boolean {
  const parsed = parseSemVer(version)
  return parsed !== null && parsed.prerelease === null
}

export function compareStable(a: string, b: string): number {
  const pa = parseSemVer(a)
  const pb = parseSemVer(b)
  if (!pa || !pb) return 0
  if (pa.major !== pb.major) return pa.major - pb.major
  if (pa.minor !== pb.minor) return pa.minor - pb.minor
  return pa.patch - pb.patch
}

export function bumpStable(version: string, bump: 'patch' | 'minor'): string {
  const parsed = parseSemVer(version)
  if (!parsed) throw new Error(`Invalid semver: ${version}`)

  if (bump === 'patch') {
    return formatSemVer({ ...parsed, patch: parsed.patch + 1, prerelease: null })
  }

  return formatSemVer({
    major: parsed.major,
    minor: parsed.minor + 1,
    patch: 0,
    prerelease: null,
  })
}

export function nextMinorBase(stableVersion: string): string {
  const parsed = parseSemVer(stableVersion)
  if (!parsed) throw new Error(`Invalid stable semver: ${stableVersion}`)
  return `${parsed.major}.${parsed.minor + 1}.0`
}

export function nextPrereleaseVersion(input: {
  stableVersion: string
  currentVersion: string
  prNumber: number
}): string {
  const base = nextMinorBase(input.stableVersion)
  const pattern = new RegExp(`^${base.replace(/\./g, '\\.')}-alpha\\.${input.prNumber}\\.(\\d+)$`)
  const match = input.currentVersion.match(pattern)
  const syncCount = match ? Number.parseInt(match[1] ?? '1', 10) + 1 : 1
  return `${base}-alpha.${input.prNumber}.${syncCount}`
}

export function tagName(version: string): string {
  return `v${version}`
}

export function npmDistTagForVersion(version: string): 'latest' | 'alpha' | 'beta' | 'rc' {
  const parsed = parseSemVer(version)
  if (!parsed?.prerelease) return 'latest'

  const identifier = parsed.prerelease.split('.')[0]?.toLowerCase()
  if (identifier === 'alpha') return 'alpha'
  if (identifier === 'beta') return 'beta'
  if (identifier === 'rc') return 'rc'

  return 'alpha'
}
