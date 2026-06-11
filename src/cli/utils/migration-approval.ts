import * as readline from 'readline'
import type { LinkConfig } from './link'

export type MigrationImpact = {
  operationType: string
  resourceType: string
  resourceHandle: string
  affectedRecords?: number
  message?: string
  isDestructive?: boolean
}

export type PendingMigrationInfo = {
  migrationId: string
  impacts: MigrationImpact[]
  timeoutMinutes: number
  createdAt: string
}

export type SyncResourcesResult = {
  tools?: { synced: number; disabled: number }
  webhooks?: { synced: number; disabled: number }
  internalModels?: {
    modelsCreated: number
    modelsUpdated: number
    fieldsCreated: number
    relationshipsCreated: number
  }
}

type SyncResourcesErrorBody = {
  error?: string
  pendingMigration?: PendingMigrationInfo
}

async function postSyncResources(
  linkConfig: LinkConfig,
  token: string,
  config: Record<string, unknown>,
): Promise<
  | { ok: true; data: SyncResourcesResult }
  | { ok: false; status: number; error: string; pendingMigration?: PendingMigrationInfo }
> {
  const response = await fetch(`${linkConfig.serverUrl}/api/cli/sync-resources`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      appVersionId: linkConfig.appVersionId,
      workplaceSubdomain: linkConfig.workplaceSubdomain,
      config,
    }),
  })

  const text = await response.text()
  let body: SyncResourcesErrorBody & SyncResourcesResult = {}
  try {
    body = JSON.parse(text) as SyncResourcesErrorBody & SyncResourcesResult
  } catch {
    body = {}
  }

  if (response.ok) {
    return { ok: true, data: body }
  }

  return {
    ok: false,
    status: response.status,
    error: body.error ?? `Resource sync failed (HTTP ${response.status})`,
    pendingMigration: body.pendingMigration,
  }
}

export async function promptForMigrationApproval(
  impacts: MigrationImpact[],
): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  console.log('')
  console.log('⚠️  This provisioning includes destructive CRM schema changes:')
  console.log('')

  const destructiveImpacts = impacts.filter((impact) => impact.isDestructive !== false)
  for (const impact of destructiveImpacts) {
    const recordInfo = impact.affectedRecords
      ? ` (${impact.affectedRecords.toLocaleString()} records affected)`
      : ''
    console.log(
      `  • ${impact.operationType.replace(/_/g, ' ')}: ${impact.resourceHandle || impact.resourceType}${recordInfo}`,
    )
    if (impact.message) {
      console.log(`    ${impact.message}`)
    }
  }

  console.log('')
  console.log('These changes cannot be undone. Data will be permanently deleted.')
  console.log('')

  return new Promise((resolve) => {
    rl.question('Do you want to proceed? (yes/no): ', (answer) => {
      rl.close()
      const normalized = answer.toLowerCase().trim()
      resolve(normalized === 'yes' || normalized === 'y')
    })
  })
}

export async function approveMigrationViaCli(
  serverUrl: string,
  token: string,
  migrationId: string,
): Promise<void> {
  const response = await fetch(`${serverUrl}/api/cli/approve-migration`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ migrationId }),
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Failed to approve migration')
  }
}

export async function waitForMigrationCompletion(
  serverUrl: string,
  token: string,
  migrationId: string,
  timeoutMs: number = 30 * 60 * 1000,
): Promise<{ completed: boolean; timedOut: boolean; denied: boolean }> {
  const startTime = Date.now()
  const pollInterval = 2000

  console.log('')
  console.log('⏳ Applying approved migration...')
  console.log(`   Migration ID: ${migrationId}`)
  console.log('')

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`${serverUrl}/api/cli/migration-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ migrationId }),
      })

      if (!response.ok) {
        throw new Error(`Failed to check migration status: ${response.statusText}`)
      }

      const data = (await response.json()) as { status: string }

      if (data.status === 'COMPLETED') {
        process.stdout.write('\n')
        return { completed: true, timedOut: false, denied: false }
      }

      if (
        data.status === 'DENIED' ||
        data.status === 'CANCELLED' ||
        data.status === 'EXPIRED' ||
        data.status === 'FAILED'
      ) {
        process.stdout.write('\n')
        return { completed: false, timedOut: false, denied: true }
      }

      const remaining = Math.ceil((timeoutMs - (Date.now() - startTime)) / 60000)
      process.stdout.write(
        `\r   Status: ${data.status} | Time remaining: ${remaining} minutes   `,
      )
    } catch {
      // Ignore polling errors, continue waiting
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  process.stdout.write('\n')
  return { completed: false, timedOut: true, denied: false }
}

export async function syncResourcesWithMigrationApproval(
  linkConfig: LinkConfig,
  token: string,
  config: Record<string, unknown>,
): Promise<SyncResourcesResult> {
  while (true) {
    const result = await postSyncResources(linkConfig, token, config)

    if (result.ok) {
      return result.data
    }

    if (result.status === 409 && result.pendingMigration) {
      const { migrationId, impacts, timeoutMinutes } = result.pendingMigration

      console.log('')
      console.log(
        '⚠️  CRM schema migration requires approval before provisioning can complete.',
      )

      const approved = await promptForMigrationApproval(impacts)
      if (!approved) {
        throw new Error('Migration approval cancelled')
      }

      await approveMigrationViaCli(linkConfig.serverUrl, token, migrationId)
      console.log('  ✓ Migration approved')

      const waitResult = await waitForMigrationCompletion(
        linkConfig.serverUrl,
        token,
        migrationId,
        timeoutMinutes * 60 * 1000,
      )

      if (waitResult.timedOut) {
        throw new Error('Migration approval timed out before changes were applied')
      }

      if (waitResult.denied || !waitResult.completed) {
        throw new Error('Migration was not applied successfully')
      }

      console.log('  ✓ Migration applied, continuing provisioning...')
      continue
    }

    throw new Error(result.error)
  }
}
