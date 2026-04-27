import * as readline from 'readline'
import { parseArgs } from '../utils'
import { getCredentials, getServerUrl } from '../utils/auth'
import { getLinkConfig, listLinkedWorkplaces } from '../utils/link'
import { parseSSEStream, type ChatEvent } from '../utils/sse'

function printHelp(): void {
  console.log(`
skedyul chat - Interactive chat with an agent

Usage:
  skedyul chat [options]

Options:
  --agent, -a       Agent handle to chat with (required)
  --workplace, -w   Workplace subdomain (uses linked workplace if not specified)
  --version, -v     Agent version number to use (default: latest published)
  --latest          Use the latest deployed version (even if unpublished)
  --input, -i       Input value in format key=value (can be repeated)
  --debug           Enable debug logging
  --help, -h        Show this help message

Examples:
  # Chat with an agent
  skedyul chat --agent sales-agent --workplace gym-demo

  # Chat with a specific version
  skedyul chat --agent sales-agent --version 2 --workplace gym-demo

  # Chat with the latest deployed version (even if draft)
  skedyul chat --agent sales-agent --latest --workplace gym-demo

  # Chat with inputs
  skedyul chat --agent sales-orchestrator --input prospectId=ins_abc123

  # Multiple inputs
  skedyul chat --agent my-agent --input prospectId=ins_abc --input contactId=con_xyz

  # Enable debug mode
  skedyul chat --agent sales-agent --debug

Interactive Commands:
  /exit, /quit      Exit the chat session
  /clear            Clear conversation history (start fresh)
  /inputs           Show current inputs
  /help             Show available commands
`)
}

// Global debug flag
let DEBUG = false

function debug(...args: unknown[]): void {
  if (DEBUG) {
    console.log('\x1b[2m  [DEBUG]', ...args, '\x1b[0m')
  }
}

interface AgentInput {
  name: string
  type: string
  required: boolean
  description?: string
}

interface AgentSchemaResponse {
  handle: string
  name: string
  description: string
  inputs: AgentInput[]
}

async function getWorkplaceToken(
  serverUrl: string,
  token: string,
  subdomain: string,
): Promise<{ workplaceId: string; workplaceName: string }> {
  const response = await fetch(
    `${serverUrl}/api/cli/workplace-token`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workplaceSubdomain: subdomain }),
    },
  )

  if (!response.ok) {
    const text = await response.text()
    let message = `Failed to get workplace: ${response.status}`
    try {
      const json = JSON.parse(text)
      if (json.error) message = json.error
    } catch {
      if (text) message = text
    }
    throw new Error(message)
  }

  const data = (await response.json()) as {
    workplaceId: string
    workplaceName: string
  }
  return data
}

async function fetchAgentSchema(
  serverUrl: string,
  token: string,
  workplaceId: string,
  agentHandle: string,
  useLatest: boolean,
  agentVersion?: number,
): Promise<AgentSchemaResponse | null> {
  const params = new URLSearchParams({
    workplaceId,
    handle: agentHandle,
  })
  if (useLatest) {
    params.set('latest', 'true')
  }
  if (agentVersion !== undefined) {
    params.set('version', String(agentVersion))
  }

  const response = await fetch(
    `${serverUrl}/api/cli/agent-schema?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
  )

  if (!response.ok) {
    debug('Failed to fetch agent schema:', response.status)
    return null
  }

  return (await response.json()) as AgentSchemaResponse
}

async function sendMessage(
  serverUrl: string,
  token: string,
  workplaceId: string,
  agentHandle: string,
  prompt: string,
  threadId: string | undefined,
  inputs: Record<string, string>,
  agentVersion?: number,
  useLatestVersion?: boolean,
): Promise<AsyncGenerator<ChatEvent>> {
  const url = `${serverUrl}/api/cli/chat?workplaceId=${encodeURIComponent(workplaceId)}`

  debug('Sending to:', url)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      prompt,
      agentHandle,
      threadId,
      inputs: Object.keys(inputs).length > 0 ? inputs : undefined,
      agentVersion,
      useLatestVersion,
    }),
  })

  debug('Response status:', response.status)
  debug('Content-Type:', response.headers.get('content-type'))

  if (!response.ok) {
    const text = await response.text()
    debug('Error response:', text)
    let message = `Chat request failed: ${response.status}`
    try {
      const json = JSON.parse(text)
      if (json.error) message = json.error
    } catch {
      if (text) message = text
    }
    throw new Error(message)
  }

  return parseSSEStream<ChatEvent>(response, DEBUG)
}

function formatThought(thought: string, isChildAgent?: boolean): string {
  const truncated = thought.length > 60 ? thought.slice(0, 57) + '...' : thought
  const indent = isChildAgent ? '      ' : '  '
  return `\x1b[2m${indent}[Thinking] ${truncated}\x1b[0m`
}

function formatToolCall(toolName: string, result?: string, isChildAgent?: boolean): string {
  const resultStr = result ? ` → ${result}` : ''
  const indent = isChildAgent ? '      ' : '  '
  return `\x1b[36m${indent}[Tool] ${toolName}${resultStr}\x1b[0m`
}

function clearLine(): void {
  process.stdout.write('\r\x1b[K')
}

export async function chatCommand(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args)

  if (flags.help || flags.h) {
    printHelp()
    return
  }

  // Set debug mode
  DEBUG = !!flags.debug

  const agentHandle = (flags.agent || flags.a) as string | undefined
  if (!agentHandle) {
    console.error('Error: --agent is required')
    console.error("Run 'skedyul chat --help' for usage information.")
    process.exit(1)
  }

  // Parse version flag
  const versionFlag = (flags.version || flags.v) as string | undefined
  const useLatest = !!flags.latest
  const agentVersion = versionFlag ? parseInt(versionFlag, 10) : undefined
  
  if (versionFlag && useLatest) {
    console.error('Error: Cannot use both --version and --latest')
    process.exit(1)
  }
  if (versionFlag && (isNaN(agentVersion!) || agentVersion! < 1)) {
    console.error('Error: --version must be a positive integer')
    process.exit(1)
  }

  const credentials = getCredentials()
  if (!credentials) {
    console.error('Error: Not logged in. Run `skedyul auth login` first.')
    process.exit(1)
  }

  const serverUrl = getServerUrl()
  debug('Server URL:', serverUrl)
  debug('Token:', credentials.token.slice(0, 20) + '...')

  let workplaceSubdomain = (flags.workplace || flags.w) as string | undefined
  if (!workplaceSubdomain) {
    const linkedWorkplaces = listLinkedWorkplaces()
    if (linkedWorkplaces.length === 1) {
      workplaceSubdomain = linkedWorkplaces[0]
    } else if (linkedWorkplaces.length > 1) {
      console.error(
        'Error: Multiple workplaces linked. Please specify --workplace.',
      )
      console.error(`Linked workplaces: ${linkedWorkplaces.join(', ')}`)
      process.exit(1)
    } else {
      console.error('Error: No workplace specified and no linked workplaces found.')
      console.error('Use --workplace or run `skedyul dev link` first.')
      process.exit(1)
    }
  }

  // Parse --input flags
  const inputs: Record<string, string> = {}
  const inputFlags = flags.input || flags.i
  if (inputFlags) {
    const inputArray = Array.isArray(inputFlags) ? inputFlags : [inputFlags]
    for (const i of inputArray) {
      const eqIndex = (i as string).indexOf('=')
      if (eqIndex > 0) {
        const key = (i as string).slice(0, eqIndex)
        const value = (i as string).slice(eqIndex + 1)
        inputs[key] = value
      } else {
        console.error(`Error: Invalid input format: ${i}`)
        console.error('Expected format: key=value (e.g., prospectId=ins_abc123)')
        process.exit(1)
      }
    }
  }

  let workplaceId: string
  let workplaceName: string

  try {
    const linkConfig = getLinkConfig(workplaceSubdomain)
    if (linkConfig) {
      workplaceId = linkConfig.workplaceId
      workplaceName = linkConfig.workplaceSubdomain
    } else {
      const result = await getWorkplaceToken(
        serverUrl,
        credentials.token,
        workplaceSubdomain,
      )
      workplaceId = result.workplaceId
      workplaceName = result.workplaceName
    }
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : 'Failed to get workplace'}`,
    )
    process.exit(1)
  }

  // Fetch agent schema to check for required inputs
  const agentSchema = await fetchAgentSchema(
    serverUrl,
    credentials.token,
    workplaceId,
    agentHandle,
    useLatest,
    agentVersion,
  )

  // Create readline interface for prompting
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const askQuestion = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer)
      })
    })
  }

  // Prompt for missing required inputs (Terraform-style)
  if (agentSchema && agentSchema.inputs.length > 0) {
    const missingInputs = agentSchema.inputs.filter(
      (input) => input.required && !inputs[input.name]
    )

    if (missingInputs.length > 0) {
      console.log('')
      for (const input of missingInputs) {
        console.log(`\x1b[1mvar.${input.name}\x1b[0m`)
        if (input.description) {
          console.log(`  ${input.description}`)
        }
        console.log('')
        const value = await askQuestion('  Enter a value: ')
        if (!value.trim()) {
          console.error(`\nError: ${input.name} is required`)
          rl.close()
          process.exit(1)
        }
        inputs[input.name] = value.trim()
        console.log('')
      }
    }
  }

  console.log('')
  const versionLabel = agentVersion ? ` v${agentVersion}` : useLatest ? ' (latest)' : ''
  console.log(`\x1b[1mSkedyul Chat\x1b[0m (${agentHandle}${versionLabel})`)
  if (Object.keys(inputs).length > 0) {
    const inputsStr = Object.entries(inputs).map(([k, v]) => `${k}=${v}`).join(', ')
    console.log(`\x1b[2mInputs: ${inputsStr}\x1b[0m`)
  }
  console.log('\x1b[2m' + '─'.repeat(50) + '\x1b[0m')
  console.log('\x1b[2mType /help for commands, Ctrl+C to exit\x1b[0m')
  console.log('')

  let threadId: string | undefined

  const processInput = async (input: string): Promise<boolean> => {
    const trimmed = input.trim()

    if (!trimmed) {
      return true // continue
    }

    if (trimmed === '/exit' || trimmed === '/quit') {
      console.log('\nGoodbye!')
      rl.close()
      process.exit(0)
    }

    if (trimmed === '/help') {
      console.log('')
      console.log('Commands:')
      console.log('  /exit, /quit  Exit the chat')
      console.log('  /clear        Start a new conversation')
      console.log('  /inputs       Show current inputs')
      console.log('  /help         Show this help')
      console.log('')
      return true
    }

    if (trimmed === '/clear') {
      threadId = undefined
      console.log('\n\x1b[2mConversation cleared.\x1b[0m\n')
      return true
    }

    if (trimmed === '/inputs') {
      if (Object.keys(inputs).length === 0) {
        console.log('\n\x1b[2mNo inputs provided.\x1b[0m\n')
      } else {
        console.log('')
        for (const [key, value] of Object.entries(inputs)) {
          console.log(`  ${key} = ${value}`)
        }
        console.log('')
      }
      return true
    }

    console.log('')
    debug('Sending request...')

    try {
      // Always send inputs on every message - the workflow needs them for each run
      // since each message starts a new workflow execution
      const inputsToSend = inputs

      const eventStream = await sendMessage(
        serverUrl,
        credentials.token,
        workplaceId,
        agentHandle,
        trimmed,
        threadId,
        inputsToSend,
        agentVersion,
        useLatest,
      )

      debug('Waiting for response...')

      let currentThought = ''
      let lastMessage = ''
      let messageStarted = false
      let pendingContexts: Array<{ model: string; label: string }> = []
      const userInput = trimmed // Track user's input to detect echo
      let currentAgentName: string | undefined // Track current agent name for display
      let currentIsChildAgent: boolean | undefined // Track if current agent is a child
      let lastDisplayedAgentName: string | undefined // Track last displayed agent name for transitions
      
      // Timing tracking
      const requestStartTime = Date.now()
      let lastEventTime = requestStartTime
      let thoughtStartTime: number | null = null
      let pendingToolCalls: Map<string, number> = new Map() // Track tool call start times

      for await (const event of eventStream) {
        const now = Date.now()
        const sinceLastEvent = now - lastEventTime
        lastEventTime = now
        
        // Track agent name and child status changes
        if (event.agentName) {
          currentAgentName = event.agentName
        }
        if (event.isChildAgent !== undefined) {
          currentIsChildAgent = event.isChildAgent
        }
        
        // Show agent name transition when entering a child agent
        if (event.agentName && event.isChildAgent && event.agentName !== lastDisplayedAgentName && !messageStarted) {
          // Clear any in-progress thought line before showing agent transition
          if (currentThought) {
            clearLine()
            currentThought = ''
          }
          console.log(`\x1b[2m    [${event.agentName}]\x1b[0m`)
          lastDisplayedAgentName = event.agentName
        }
        
        if (event.initial && event.threadId) {
          threadId = event.threadId
        }

        // Display context events
        if (event.context && event.context.length > 0 && !messageStarted) {
          for (const ctx of event.context) {
            // Clear any in-progress thought line before showing context
            if (currentThought) {
              clearLine()
              currentThought = ''
            }
            // Use hint or model for the type, fallback to empty string
            const contextType = ctx.hint || ctx.model || ''
            // Use server-provided duration if available
            const durationStr = event.durationMs ? ` (${event.durationMs}ms)` : ''
            const indent = event.isChildAgent ? '      ' : '  '
            console.log(
              `\x1b[2m${indent}[Context] ${contextType ? contextType.toLowerCase() + ': ' : ''}${ctx.label}${durationStr}\x1b[0m`,
            )
          }
        }

        // Only show thoughts before message starts streaming
        if (event.thought !== undefined && !messageStarted) {
          // If server provides durationMs, treat as complete thought with timing
          if (event.durationMs !== undefined) {
            clearLine()
            console.log(formatThought(event.thought, event.isChildAgent) + `\x1b[2m (${event.durationMs}ms)\x1b[0m`)
            currentThought = ''
            thoughtStartTime = null
          } else if (!event.thoughtComplete) {
            if (currentThought !== event.thought) {
              // New thought starting
              if (thoughtStartTime === null) {
                thoughtStartTime = now
              }
              clearLine()
              process.stdout.write(formatThought(event.thought, event.isChildAgent))
              currentThought = event.thought
            }
          } else {
            clearLine()
            // Calculate locally if no server-provided duration
            const thoughtDuration = thoughtStartTime ? now - thoughtStartTime : 0
            console.log(formatThought(event.thought, event.isChildAgent) + `\x1b[2m (${thoughtDuration}ms)\x1b[0m`)
            currentThought = ''
            thoughtStartTime = null
          }
        }

        // Show agent output (full output from agent stages, not truncated)
        if (event.agentOutput !== undefined && !messageStarted) {
          // Clear any in-progress thought
          if (currentThought) {
            clearLine()
            currentThought = ''
            thoughtStartTime = null
          }
          
          const indent = event.isChildAgent ? '      ' : '  '
          const durationStr = event.durationMs ? ` (${event.durationMs}ms)` : ''
          console.log(`\x1b[33m${indent}[Output]${durationStr}\x1b[0m`)
          // Show the full output with proper indentation
          const lines = event.agentOutput.split('\n')
          for (const line of lines) {
            console.log(`\x1b[33m${indent}  ${line}\x1b[0m`)
          }
        }

        // Show tool calls
        if (event.toolCall) {
          debug('Tool call event received:', event.toolCall.name, event.toolCall.status, 'messageStarted:', messageStarted)
          
          if (!messageStarted) {
            // Clear any in-progress thought
            if (currentThought) {
              clearLine()
              currentThought = ''
              thoughtStartTime = null
            }
            
            const tc = event.toolCall as { name: string; status: string; args?: Record<string, unknown>; durationMs?: number; resultSummary?: string }
            const indent = event.isChildAgent ? '      ' : '  '
            
            // Extract display name from tool name (e.g., "system:crm:prospect:update:stage" -> "Update Stage")
            const getDisplayName = (name: string): string => {
              const parts = name.split(':')
              const lastPart = parts[parts.length - 1]
              // Convert to title case and handle common patterns
              if (lastPart === 'stage') return 'Update Stage'
              if (lastPart === 'update') return 'Update Record'
              return lastPart.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
            }
            
            const displayName = getDisplayName(tc.name)
            
            if (tc.status === 'started') {
              pendingToolCalls.set(tc.name, now)
              console.log(`\x1b[36m${indent}[Tool] ${displayName}...\x1b[0m`)
              // Show args being sent (excluding id field and null/undefined values)
              if (tc.args) {
                const argsToShow = Object.entries(tc.args).filter(
                  ([key, value]) => key !== 'id' && value !== null && value !== undefined
                )
                for (const [key, value] of argsToShow) {
                  const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value)
                  console.log(`\x1b[36m${indent}  ${key}: ${displayValue}\x1b[0m`)
                }
              }
            } else if (tc.status === 'completed') {
              // Parse result summary if available
              let summary = ''
              if (tc.resultSummary) {
                try {
                  const parsed = JSON.parse(tc.resultSummary)
                  summary = parsed.summary || parsed.display?.label || ''
                } catch {
                  summary = ''
                }
              }
              // Use server-provided duration or calculate from our tracking
              const duration = tc.durationMs || (pendingToolCalls.has(tc.name) ? now - pendingToolCalls.get(tc.name)! : 0)
              pendingToolCalls.delete(tc.name)
              const durationStr = duration ? ` (${duration}ms)` : ''
              console.log(`\x1b[32m${indent}[Tool] ${displayName} ✓${summary ? ` ${summary}` : ''}${durationStr}\x1b[0m`)
            } else if (tc.status === 'failed') {
              const duration = pendingToolCalls.has(tc.name) ? now - pendingToolCalls.get(tc.name)! : 0
              pendingToolCalls.delete(tc.name)
              const durationStr = duration ? ` (${duration}ms)` : ''
              console.log(`\x1b[31m${indent}[Tool] ${displayName} ✗ failed${durationStr}\x1b[0m`)
            }
          } else {
            debug('Skipping tool call display because messageStarted is true')
          }
        }

        // Show data blocks (legacy support)
        if (event.data && event.data.length > 0 && !messageStarted) {
          // Clear any in-progress thought
          if (currentThought) {
            clearLine()
            currentThought = ''
          }
          for (const block of event.data) {
            if (block.type === 'tool_result') {
              const toolName = (block as { toolName?: string }).toolName || 'tool'
              const summary = (block as { summary?: string }).summary
              console.log(formatToolCall(toolName, summary))
            }
          }
        }

        if (event.message !== undefined && event.message !== lastMessage) {
          // Skip if this is just an echo of the user's input
          const isUserEcho = event.message.toLowerCase() === userInput.toLowerCase()
          if (isUserEcho) {
            debug('Skipping user input echo:', JSON.stringify(event.message))
            lastMessage = event.message
            continue
          }
          
          if (!messageStarted) {
            // Clear any in-progress thought before starting message
            if (currentThought) {
              clearLine()
              currentThought = ''
            }
            const displayName = currentAgentName || 'Agent'
            process.stdout.write(`\n\x1b[1m${displayName}:\x1b[0m `)
            messageStarted = true
          }

          debug('Message event - last:', JSON.stringify(lastMessage), 'new:', JSON.stringify(event.message))
          
          // Check if new message is an extension of the old one (streaming tokens)
          // or if it's a completely new message (multi-stage agent replacement)
          let newContent: string
          if (event.message.startsWith(lastMessage)) {
            // Streaming: new message extends the old one
            newContent = event.message.slice(lastMessage.length)
          } else {
            // Replacement: new message is different, show the whole thing
            // Add a space separator if we already have content
            newContent = lastMessage ? ' ' + event.message : event.message
          }
          
          debug('New content:', JSON.stringify(newContent))
          process.stdout.write(newContent)
          lastMessage = event.message
        }

        if (event.done) {
          const totalTime = Date.now() - requestStartTime
          if (!messageStarted && lastMessage) {
            const displayName = currentAgentName || 'Agent'
            console.log(`\n\x1b[1m${displayName}:\x1b[0m ${lastMessage}`)
          } else if (messageStarted) {
            console.log('')
          }
          console.log(`\x1b[2m  Total: ${totalTime}ms\x1b[0m`)
          break
        }

        if (event.error) {
          console.error(`\n\x1b[31mError: ${event.error}\x1b[0m`)
          break
        }
      }
    } catch (error) {
      console.error(
        `\n\x1b[31mError: ${error instanceof Error ? error.message : 'Unknown error'}\x1b[0m`,
      )
    }

    console.log('')
    return true
  }

  const runLoop = async (): Promise<void> => {
    while (true) {
      const input = await askQuestion('\x1b[1mYou:\x1b[0m ')
      await processInput(input)
    }
  }

  rl.on('close', () => {
    console.log('\nGoodbye!')
    process.exit(0)
  })

  process.on('SIGINT', () => {
    console.log('\nGoodbye!')
    process.exit(0)
  })

  runLoop().catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
}
