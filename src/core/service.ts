import type {
  CommunicationChannel,
  CommunicationService,
  Message,
  WebhookRequest,
  WebhookResponse,
} from './types'

class CoreApiService {
  private service?: CommunicationService
  private webhookHandler?: (request: WebhookRequest) => Promise<WebhookResponse>

  register(service: CommunicationService) {
    this.service = service
  }

  getService(): CommunicationService | undefined {
    return this.service
  }

  setWebhookHandler(handler: (request: WebhookRequest) => Promise<WebhookResponse>) {
    this.webhookHandler = handler
  }

  async dispatchWebhook(request: WebhookRequest): Promise<WebhookResponse> {
    if (!this.webhookHandler) {
      return { status: 404 }
    }
    return this.webhookHandler(request)
  }

  async callCreateChannel(channel: CommunicationChannel) {
    return this.service?.createCommunicationChannel(channel)
  }

  async callUpdateChannel(channel: CommunicationChannel) {
    return this.service?.updateCommunicationChannel(channel)
  }

  async callDeleteChannel(id: string) {
    return this.service?.deleteCommunicationChannel(id)
  }

  async callGetChannel(id: string) {
    return this.service?.getCommunicationChannel(id)
  }

  async callListChannels() {
    return this.service?.getCommunicationChannels()
  }

  async callGetWorkplace(id: string) {
    return this.service?.getWorkplace(id)
  }

  async callListWorkplaces() {
    return this.service?.listWorkplaces()
  }

  async callSendMessage(args: {
    message: Message
    communicationChannel: CommunicationChannel
  }) {
    return this.service?.sendMessage(args)
  }
}

export const coreApiService = new CoreApiService()

