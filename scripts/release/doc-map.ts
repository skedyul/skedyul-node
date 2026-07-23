export interface DocMapping {
  patterns: string[]
  docs: string[]
}

export const DOC_MAP: DocMapping[] = [
  { patterns: ['README.md', 'docs/README.md'], docs: ['README.md', 'docs/README.md'] },
  {
    patterns: ['src/config/', 'skedyul.config'],
    docs: ['docs/configuration.md', 'docs/lifecycle-hooks.md'],
  },
  { patterns: ['src/types/tool', 'src/server/tool-handler', 'src/schemas/'], docs: ['docs/tools.md'] },
  { patterns: ['src/types/webhook', 'src/server/handlers/webhook'], docs: ['docs/webhooks.md'] },
  {
    patterns: ['src/server/handlers/install', 'src/server/handlers/provision', 'src/server/handlers/uninstall', 'src/server/handlers/oauth'],
    docs: ['docs/lifecycle-hooks.md'],
  },
  { patterns: ['src/server/', 'src/server.ts'], docs: ['docs/server.md'] },
  { patterns: ['src/ratelimit/'], docs: ['docs/rate-limit-queues.md'] },
  { patterns: ['src/sequencer/'], docs: ['docs/sequencer.md', 'docs/configuration.md'] },
  { patterns: ['src/core/'], docs: ['docs/core-api.md', 'docs/authentication.md'] },
  { patterns: ['src/errors'], docs: ['docs/errors.md'] },
  {
    patterns: ['src/schemas/agent', 'src/skills/', 'src/workflows/', 'src/scheduling/', 'src/compiler/', 'src/context/', 'src/memory/', 'src/events/', 'src/triggers/'],
    docs: ['docs/agents.md', 'docs/cli.md'],
  },
  { patterns: ['src/schemas/crm', 'src/cli/commands/crm'], docs: ['docs/crm-schema.md', 'docs/cli.md'] },
  { patterns: ['src/cli/'], docs: ['docs/cli.md', 'README.md'] },
  { patterns: ['package.json'], docs: ['README.md', 'docs/README.md'] },
]

export function docsForChangedFiles(changedFiles: string[]): string[] {
  const docs = new Set<string>()

  for (const file of changedFiles) {
    for (const mapping of DOC_MAP) {
      if (mapping.patterns.some((pattern) => file.includes(pattern) || file.startsWith(pattern))) {
        for (const doc of mapping.docs) docs.add(doc)
      }
    }
  }

  return [...docs].sort()
}

export function isPublicSurfaceChange(changedFiles: string[]): boolean {
  return changedFiles.some(
    (file) =>
      file.startsWith('src/') ||
      file === 'package.json' ||
      file.startsWith('bin/') ||
      file.startsWith('docs/'),
  )
}
