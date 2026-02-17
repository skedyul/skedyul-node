import { coreApiService } from '../core/service'
import type { CommunicationChannel, Message } from '../core/types'
import type { CoreMethod } from './types'

/**
 * Handles core API method calls for communication channels and workplaces
 */
export async function handleCoreMethod(
  method: CoreMethod,
  params: Record<string, unknown> | undefined,
): Promise<{ status: number; payload: unknown }> {
  const service = coreApiService.getService()
  if (!service) {
    return {
      status: 404,
      payload: { error: 'Core API service not configured' },
    }
  }

  if (method === 'createCommunicationChannel') {
    if (!params?.channel) {
      return { status: 400, payload: { error: 'channel is required' } }
    }
    const channel = params.channel as CommunicationChannel
    const result = await coreApiService.callCreateChannel(channel)
    if (!result) {
      return {
        status: 500,
        payload: { error: 'Core API service did not respond' },
      }
    }
    return { status: 200, payload: result }
  }

  if (method === 'updateCommunicationChannel') {
    if (!params?.channel) {
      return { status: 400, payload: { error: 'channel is required' } }
    }
    const channel = params.channel as CommunicationChannel
    const result = await coreApiService.callUpdateChannel(channel)
    if (!result) {
      return {
        status: 500,
        payload: { error: 'Core API service did not respond' },
      }
    }
    return { status: 200, payload: result }
  }

  if (method === 'deleteCommunicationChannel') {
    if (!params?.id || typeof params.id !== 'string') {
      return { status: 400, payload: { error: 'id is required' } }
    }
    const result = await coreApiService.callDeleteChannel(params.id as string)
    if (!result) {
      return {
        status: 500,
        payload: { error: 'Core API service did not respond' },
      }
    }
    return { status: 200, payload: result }
  }

  if (method === 'getCommunicationChannel') {
    if (!params?.id || typeof params.id !== 'string') {
      return { status: 400, payload: { error: 'id is required' } }
    }
    const result = await coreApiService.callGetChannel(params.id as string)
    if (!result) {
      return {
        status: 404,
        payload: { error: 'Channel not found' },
      }
    }
    return { status: 200, payload: result }
  }

  if (method === 'getCommunicationChannels') {
    const result = await coreApiService.callListChannels()
    if (!result) {
      return {
        status: 500,
        payload: { error: 'Core API service did not respond' },
      }
    }
    return { status: 200, payload: result }
  }

  if (method === 'communicationChannel.list') {
    const result = await coreApiService.callListChannels()
    if (!result) {
      return {
        status: 500,
        payload: { error: 'Core API service did not respond' },
      }
    }
    return { status: 200, payload: result }
  }

  if (method === 'communicationChannel.get') {
    if (!params?.id || typeof params.id !== 'string') {
      return { status: 400, payload: { error: 'id is required' } }
    }
    const result = await coreApiService.callGetChannel(params.id as string)
    if (!result) {
      return {
        status: 404,
        payload: { error: 'Channel not found' },
      }
    }
    return { status: 200, payload: result }
  }

  if (method === 'workplace.list') {
    const result = await coreApiService.callListWorkplaces()
    if (!result) {
      return {
        status: 500,
        payload: { error: 'Core API service did not respond' },
      }
    }
    return { status: 200, payload: result }
  }

  if (method === 'workplace.get') {
    if (!params?.id || typeof params.id !== 'string') {
      return { status: 400, payload: { error: 'id is required' } }
    }
    const result = await coreApiService.callGetWorkplace(params.id as string)
    if (!result) {
      return {
        status: 404,
        payload: { error: 'Workplace not found' },
      }
    }
    return { status: 200, payload: result }
  }

  if (method === 'sendMessage') {
    if (!params?.message || !params?.communicationChannel) {
      return { status: 400, payload: { error: 'message and communicationChannel are required' } }
    }
    const msg = params.message as Message
    const channel = params.communicationChannel as CommunicationChannel
    const result = await coreApiService.callSendMessage({
      message: msg,
      communicationChannel: channel,
    })
    if (!result) {
      return {
        status: 500,
        payload: { error: 'Core API service did not respond' },
      }
    }
    return { status: 200, payload: result }
  }

  return {
    status: 400,
    payload: { error: 'Unknown core method' },
  }
}
