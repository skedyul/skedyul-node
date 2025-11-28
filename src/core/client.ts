import type { CommunicationChannel, Workplace } from './types'

const CORE_BASE = process.env.SKEDYUL_NODE_URL ?? ''

type CoreRequest = {
  method: string
  params?: Record<string, unknown>
}

async function callCore(method: string, params?: Record<string, unknown>) {
  const response = await fetch(`${CORE_BASE}/core`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ method, params }),
  })

  const payload = await response.json()

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ?? `Core API error (${response.status})`,
    )
  }

  return payload
}

type ListArgs = {
  filter?: Record<string, unknown>
}

export const workplace = {
  async list(args?: ListArgs) {
    const payload = await callCore('workplace.list', args?.filter ? { filter: args.filter } : undefined)
    return payload.workplaces as Workplace[]
  },
  async get(id: string) {
    const payload = await callCore('workplace.get', { id })
    return payload.workplace as Workplace
  },
}

export const communicationChannel = {
  async list(filter?: Record<string, unknown>) {
    const payload = await callCore(
      'communicationChannel.list',
      filter ? { filter } : undefined,
    )
    return payload.channels as CommunicationChannel[]
  },
  async get(id: string) {
    const payload = await callCore('communicationChannel.get', { id })
    return payload.channel as CommunicationChannel
  },
}

