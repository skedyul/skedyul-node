import http, { IncomingMessage } from 'http'
import type { APIGatewayProxyResult, CorsOptions, SkedyulServerConfig } from '../../types'

/**
 * Reads the raw request body from an IncomingMessage
 */
export function readRawRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''

    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
    })

    req.on('end', () => {
      resolve(body)
    })

    req.on('error', reject)
  })
}

/**
 * Parses JSON body from an IncomingMessage
 */
export async function parseJSONBody(req: IncomingMessage): Promise<unknown> {
  const rawBody = await readRawRequestBody(req)
  try {
    return rawBody ? JSON.parse(rawBody) : {}
  } catch (err) {
    throw err
  }
}

/**
 * Sends a JSON response
 */
export function sendJSON(
  res: http.ServerResponse,
  statusCode: number,
  data: unknown,
): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

/**
 * Sends an HTML response
 */
export function sendHTML(
  res: http.ServerResponse,
  statusCode: number,
  html: string,
): void {
  res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
}

/**
 * Gets default CORS headers
 */
export function getDefaultHeaders(options?: CorsOptions): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': options?.allowOrigin ?? '*',
    'Access-Control-Allow-Methods':
      options?.allowMethods ?? 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      options?.allowHeaders ?? 'Content-Type',
  }
}

/**
 * Creates an API Gateway proxy response
 */
export function createResponse(
  statusCode: number,
  body: unknown,
  headers: Record<string, string>,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  }
}

/**
 * Gets the port to listen on from config or environment
 */
export function getListeningPort(config: SkedyulServerConfig): number {
  const envPort = Number.parseInt(process.env.PORT ?? '', 10)
  if (!Number.isNaN(envPort)) {
    return envPort
  }

  return config.defaultPort ?? 3000
}
