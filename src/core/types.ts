export interface CommunicationChannel {
  id: string
  name: string
  type: 'sms' | 'whatsapp' | 'email'
  createdAt: string
  metadata?: Record<string, unknown>
}

export interface Workplace {
  id: string
  name: string
  createdAt: string
  metadata?: Record<string, unknown>
}

export interface Message {
  id: string
  channelId: string
  body: string
  sentAt: string
  metadata?: Record<string, unknown>
}

export interface WebhookRequest {
  method: string
  url?: string
  path?: string
  headers: Record<string, string>
  query?: Record<string, string | undefined>
  body?: unknown
  rawBody?: Buffer
}

export interface WebhookResponse {
  status: number
  body?: unknown
}

export interface CommunicationService {
  createCommunicationChannel(
    channel: CommunicationChannel,
  ): Promise<{ channel: CommunicationChannel }>
  updateCommunicationChannel(
    channel: CommunicationChannel,
  ): Promise<{ channel: CommunicationChannel }>
  deleteCommunicationChannel(id: string): Promise<{ success: boolean }>
  getCommunicationChannel(id: string): Promise<{ channel: CommunicationChannel }>
  getCommunicationChannels(): Promise<{ channels: CommunicationChannel[] }>
  sendMessage(args: {
    message: Message
    communicationChannel: CommunicationChannel
  }): Promise<{ message: Message }>
  getWorkplace(id: string): Promise<{ workplace: Workplace }>
  listWorkplaces(): Promise<{ workplaces: Workplace[] }>
}

export interface CoreApiConfig {
  service: CommunicationService
  webhookHandler?: (request: WebhookRequest) => Promise<WebhookResponse>
}

