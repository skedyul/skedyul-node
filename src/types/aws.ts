// ─────────────────────────────────────────────────────────────────────────────
// AWS Lambda Types
// ─────────────────────────────────────────────────────────────────────────────

export interface APIGatewayProxyEvent {
  body: string | null
  headers: Record<string, string>
  httpMethod: string
  path: string
  queryStringParameters: Record<string, string> | null
  requestContext: {
    requestId: string
  }
}

export interface APIGatewayProxyResult {
  statusCode: number
  headers?: Record<string, string>
  body: string
}
