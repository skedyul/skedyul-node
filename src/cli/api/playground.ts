import { callCliApi } from '../utils/auth'
import { cliApi, getWorkplaceToken, type CliContext } from './context'

export interface PlaygroundScheduledMessage {
  id: string
  status: string
  scheduledAt: string
  content: string
  requiresApproval?: boolean
  cancelOnActivity?: boolean
}

export interface PlaygroundSendResult {
  success: boolean
  threadId: string
  userMessageId?: string
  agentMessageId?: string
  agentResponse: string
  agentRunId?: string
  status: string
  currentTime?: string
  scheduledMessageIds?: string[]
  scheduledMessages: PlaygroundScheduledMessage[]
  session?: {
    threadId: string
    agentId: string
    agentHandle: string | null
    agentName: string
  } | null
  error?: string
}

export interface PlaygroundInspectResult {
  success: boolean
  threadId: string
  title: string | null
  agentId?: string
  agentHandle?: string | null
  agentName?: string
  messages: Array<{
    id: string
    role: 'user' | 'assistant'
    content: string
    createdAt: string
  }>
  scheduledMessages: PlaygroundScheduledMessage[]
  sendCalls: Array<{
    toolName: string
    content: string | null
    sendAt: unknown
  }>
  error?: string
}

export interface PlaygroundCreateResult {
  success: boolean
  threadId: string
  agentId: string
  agentHandle: string | null
  agentName: string
  error?: string
}

export interface PlaygroundTurnInput {
  handle?: string
  agentId?: string
  threadId?: string
  message: string
  currentTime?: string
  contactId?: string
  appInstallationId?: string
  title?: string
  sandbox?: boolean
}

export async function sendPlaygroundTurn(
  ctx: CliContext,
  workplace: string,
  input: PlaygroundTurnInput,
): Promise<PlaygroundSendResult> {
  const workplaceToken = await getWorkplaceToken(ctx, workplace)
  return callCliApi<PlaygroundSendResult>(cliApi(ctx), '/playground', {
    workplaceId: workplaceToken.workplaceId,
    action: 'send',
    handle: input.handle,
    agentId: input.agentId,
    threadId: input.threadId,
    content: input.message,
    currentTime: input.currentTime,
    contactId: input.contactId,
    appInstallationId: input.appInstallationId,
    title: input.title,
    sandbox: input.sandbox,
  })
}

export async function inspectPlaygroundSession(
  ctx: CliContext,
  workplace: string,
  threadId: string,
): Promise<PlaygroundInspectResult> {
  const workplaceToken = await getWorkplaceToken(ctx, workplace)
  return callCliApi<PlaygroundInspectResult>(cliApi(ctx), '/playground', undefined, {
    method: 'GET',
    query: {
      workplaceId: workplaceToken.workplaceId,
      threadId,
    },
  })
}

export async function createPlaygroundSession(
  ctx: CliContext,
  workplace: string,
  input: {
    handle?: string
    agentId?: string
    title?: string
    contactId?: string
    appInstallationId?: string
  },
): Promise<PlaygroundCreateResult> {
  const workplaceToken = await getWorkplaceToken(ctx, workplace)
  return callCliApi<PlaygroundCreateResult>(cliApi(ctx), '/playground', {
    workplaceId: workplaceToken.workplaceId,
    action: 'create',
    ...input,
  })
}

export const playground = {
  send: sendPlaygroundTurn,
  get: inspectPlaygroundSession,
  create: createPlaygroundSession,
}
