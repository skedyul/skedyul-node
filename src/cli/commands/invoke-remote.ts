import * as fs from 'fs'
import * as path from 'path'
import { parseArgs, formatJson } from '../utils'
import { getCredentials, getServerUrl, getActiveProfileName } from '../utils/auth'

interface InvokeToolResponse {
  success: boolean
  result: unknown
  error?: string
  availableTools?: string[]
}

interface ErrorResponse {
  error: string
  availableTools?: string[]
}

interface UploadFileResponse {
  success: boolean
  id: string
  url: string | null
  error?: string
}

/**
 * Simple MIME type lookup based on file extension.
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.csv': 'text/csv',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.zip': 'application/zip',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.wav': 'audio/wav',
  }
  return mimeTypes[ext] || 'application/octet-stream'
}

/**
 * Upload a local file to the platform and return its file ID.
 */
async function uploadLocalFile(
  filePath: string,
  serverUrl: string,
  token: string,
  appInstallationId: string,
): Promise<string> {
  const absolutePath = path.resolve(filePath)

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`)
  }

  const content = fs.readFileSync(absolutePath)
  const fileName = path.basename(absolutePath)
  const mimeType = getMimeType(absolutePath)

  console.error(`Uploading file: ${fileName} (${mimeType}, ${content.length} bytes)...`)

  const url = `${serverUrl}/api/cli/upload-file`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      appInstallationId,
      content: content.toString('base64'),
      name: fileName,
      mimeType,
    }),
  })

  const text = await response.text()

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      throw new Error(
        `Server returned HTML instead of JSON (status ${response.status}). ` +
        `This usually means the API endpoint doesn't exist or there's a server error.`
      )
    }
    throw new Error(`Invalid response from server: ${text.substring(0, 200)}`)
  }

  if (!response.ok) {
    const errorResponse = json as ErrorResponse
    throw new Error(errorResponse.error ?? `Upload failed: ${response.status}`)
  }

  const uploadResponse = json as UploadFileResponse
  if (!uploadResponse.success || !uploadResponse.id) {
    throw new Error(uploadResponse.error ?? 'Upload failed: no file ID returned')
  }

  console.error(`Uploaded: ${fileName} -> ${uploadResponse.id}`)
  return uploadResponse.id
}

/**
 * Process upload templates in args object.
 * Recursively scans all string values and replaces {{upload:/path/to/file}} patterns
 * with the uploaded file ID.
 */
async function processUploadTemplates(
  args: Record<string, unknown>,
  serverUrl: string,
  token: string,
  appInstallationId: string,
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      const match = value.match(/^\{\{upload:(.+)\}\}$/)
      if (match) {
        const filePath = match[1]
        const fileId = await uploadLocalFile(filePath, serverUrl, token, appInstallationId)
        result[key] = fileId
      } else {
        result[key] = value
      }
    } else if (Array.isArray(value)) {
      result[key] = await Promise.all(
        value.map(async (item) => {
          if (typeof item === 'string') {
            const match = item.match(/^\{\{upload:(.+)\}\}$/)
            if (match) {
              return await uploadLocalFile(match[1], serverUrl, token, appInstallationId)
            }
          } else if (item && typeof item === 'object') {
            return await processUploadTemplates(
              item as Record<string, unknown>,
              serverUrl,
              token,
              appInstallationId,
            )
          }
          return item
        })
      )
    } else if (value && typeof value === 'object') {
      result[key] = await processUploadTemplates(
        value as Record<string, unknown>,
        serverUrl,
        token,
        appInstallationId,
      )
    } else {
      result[key] = value
    }
  }

  return result
}

async function callInvokeApi(
  serverUrl: string,
  token: string,
  body: Record<string, unknown>,
): Promise<InvokeToolResponse> {
  const url = `${serverUrl}/api/cli/invoke-tool`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  const text = await response.text()

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      throw new Error(
        `Server returned HTML instead of JSON (status ${response.status}). ` +
        `This usually means the API endpoint doesn't exist or there's a server error.`
      )
    }
    throw new Error(`Invalid response from server: ${text.substring(0, 200)}`)
  }

  if (!response.ok) {
    const errorResponse = json as ErrorResponse
    let errorMessage = errorResponse.error ?? `API error: ${response.status}`
    if (errorResponse.availableTools && errorResponse.availableTools.length > 0) {
      errorMessage += `\n\nAvailable tools:\n${errorResponse.availableTools.map(t => `  - ${t}`).join('\n')}`
    }
    throw new Error(errorMessage)
  }

  return json as InvokeToolResponse
}

function printHelp(): void {
  console.log(`
skedyul invoke - Invoke a tool on a hosted app version

Usage:
  skedyul invoke <tool-name> --appInstallationId <id> [options]

Arguments:
  <tool-name>              Name of the tool to invoke (e.g., 'parse_lab_report')

Required Options:
  --appInstallationId, -i  The app installation ID to invoke the tool on

Optional Options:
  --args, -a               JSON string of arguments to pass to the tool
                           Supports {{upload:/path/to/file}} syntax for file uploads
  --timeout, -t            Timeout in milliseconds (default: uses tool config)
  --server                 Override the server URL
  --help, -h               Show this help message

File Upload Syntax:
  Use {{upload:/path/to/file}} in any string field within --args to automatically
  upload a local file and replace the template with the uploaded file ID.

Examples:
  # Invoke a tool with no arguments
  skedyul invoke get_appointments --appInstallationId inst_abc123

  # Invoke a tool with arguments
  skedyul invoke parse_lab_report \\
    --appInstallationId inst_abc123 \\
    --args '{"file_id": "fl_existing_id"}'

  # Invoke with file upload (uploads file and injects file_id)
  skedyul invoke parse_lab_report \\
    --appInstallationId inst_abc123 \\
    --args '{"file_id": "{{upload:/path/to/report.pdf}}"}'

  # Multiple file uploads in one command
  skedyul invoke process_documents \\
    --appInstallationId inst_abc123 \\
    --args '{"doc": "{{upload:./doc.pdf}}", "image": "{{upload:./photo.jpg}}"}'

  # Invoke with custom timeout (30 seconds)
  skedyul invoke long_running_task \\
    --appInstallationId inst_abc123 \\
    --timeout 30000

Note:
  You must be logged in with 'skedyul auth login' and have access to the
  workplace where the app is installed.
`)
}

export async function invokeRemoteCommand(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args)

  if (flags.help || flags.h) {
    printHelp()
    return
  }

  const toolName = positional[0]

  if (!toolName) {
    console.error('Error: Tool name is required')
    console.error("Run 'skedyul invoke --help' for usage information.")
    process.exit(1)
  }

  const appInstallationId = (flags.appInstallationId || flags.i) as string | undefined

  if (!appInstallationId) {
    console.error('Error: --appInstallationId is required')
    console.error("Run 'skedyul invoke --help' for usage information.")
    process.exit(1)
  }

  let toolArgs: Record<string, unknown> = {}
  const argsValue = flags.args || flags.a
  if (argsValue && typeof argsValue === 'string') {
    try {
      toolArgs = JSON.parse(argsValue)
    } catch {
      console.error('Error: Invalid JSON in --args')
      process.exit(1)
    }
  }

  let timeout: number | undefined
  const timeoutValue = flags.timeout || flags.t
  if (timeoutValue) {
    const parsed = parseInt(String(timeoutValue), 10)
    if (isNaN(parsed) || parsed <= 0) {
      console.error('Error: --timeout must be a positive number')
      process.exit(1)
    }
    timeout = parsed
  }

  const credentials = getCredentials()
  if (!credentials) {
    console.error('Error: Not logged in.')
    console.error("Run 'skedyul auth login' to authenticate first.")
    process.exit(1)
  }

  const serverUrl = getServerUrl(flags.server as string | undefined)
  const activeProfile = getActiveProfileName()

  console.error(`Invoking tool: ${toolName}`)
  console.error(`App Installation: ${appInstallationId}`)
  console.error(`Server: ${serverUrl}`)
  if (activeProfile) {
    console.error(`Profile: ${activeProfile}`)
  }

  try {
    toolArgs = await processUploadTemplates(
      toolArgs,
      serverUrl,
      credentials.token,
      appInstallationId,
    )

    const response = await callInvokeApi(
      serverUrl,
      credentials.token,
      {
        appInstallationId,
        toolName,
        args: toolArgs,
        ...(timeout !== undefined && { timeout }),
      },
    )

    if (response.success) {
      console.log(formatJson({ result: response.result }))
    } else {
      console.error(`Error: ${response.error ?? 'Unknown error'}`)
      process.exit(1)
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
