import { callCliApi } from '../utils/auth'

/**
 * Explicit CLI credentials. Callers (CLI, MCP stdio, hosted MCP) build this
 * themselves — these APIs never read `~/.skedyul`.
 */
export interface CliContext {
  token: string
  serverUrl: string
}

export interface WorkplaceToken {
  token: string
  expiresAt: string
  workplaceId: string
  workplaceName: string
  workplaceSubdomain: string
}

export interface WorkplaceSummary {
  id: string
  name: string
  subdomain: string
}

export function cliApi(ctx: CliContext) {
  return {
    serverUrl: ctx.serverUrl,
    token: ctx.token,
  }
}

export async function getWorkplaceToken(
  ctx: CliContext,
  workplaceSubdomain: string,
): Promise<WorkplaceToken> {
  return callCliApi<WorkplaceToken>(cliApi(ctx), '/workplace-token', {
    workplaceSubdomain,
  })
}

export async function listWorkplaces(ctx: CliContext): Promise<WorkplaceSummary[]> {
  const result = await callCliApi<{ workplaces: WorkplaceSummary[] }>(
    cliApi(ctx),
    '/workplaces',
    undefined,
    { method: 'GET' },
  )
  return result.workplaces
}

export const workplaces = {
  list: listWorkplaces,
  getWorkplaceToken,
}
