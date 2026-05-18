import * as readline from 'readline'
import { parseArgs } from '../utils'
import { getCredentials, getServerUrl } from '../utils/auth'
import { getLinkConfig, listLinkedWorkplaces } from '../utils/link'
import { parseSSEStream, type ChatEvent } from '../utils/sse'
import { loadMockContext, parseMockSender, buildMockContext } from '../utils/mock-context'
import type { MockContext } from '../../context/types'

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

Sandbox Options:
  --sandbox         Enable sandbox mode (no real thread created)
  --mock-context    Path to mock context JSON file
  --mock-sender     Quick mock sender (e.g., "John Smith:contact:customer")

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

  # Sandbox mode with mock context file
  skedyul chat --agent sales-agent --workplace demo --sandbox --mock-context ./test-context.json

  # Sandbox mode with quick mock sender
  skedyul chat --agent sales-agent --workplace demo --sandbox --mock-sender "John Smith:contact:customer"

Interactive Commands:
  /exit, /quit      Exit the chat session
  /clear            Clear conversation history (start fresh)
  /inputs           Show current inputs
  /context          Show mock context (sandbox mode only)
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

/**
 * Tool history entry for tracking tool calls across conversation turns.
 * Matches the ToolHistoryEntrySchema from skedyul-core.
 */
interface ToolHistoryEntry {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  result: unknown
  timestamp: number
  /** Provider-specific options (e.g., Gemini's thought_signature for tool call replay) */
  providerOptions?: Record<string, unknown>
}

/**
 * Tool call entry for nested trace display.
 */
interface TraceToolCall {
  toolCallId: string
  toolName: string
  displayName?: string
  args: Record<string, unknown>
  result?: unknown
  durationMs?: number
  isSkillLoad?: boolean
  skillHandle?: string
  skillToolNames?: string[]
  childToolCalls?: TraceToolCall[]
}

const SKILL_LOAD_TOOL_NAMES = new Set(["system:skill:load", "load_skill"]);

function isSkillLoadToolName(toolName: string): boolean {
  return SKILL_LOAD_TOOL_NAMES.has(toolName);
}

function extractSkillToolNamesFromResult(result: unknown): string[] {
  if (!result) return [];
  
  let obj = result;
  if (typeof result === "string") {
    try {
      obj = JSON.parse(result);
    } catch {
      return [];
    }
  }
  
  if (!obj || typeof obj !== "object") return [];
  const tools = (obj as { tools?: Array<{ tool?: string }> }).tools;
  if (!Array.isArray(tools)) return [];
  return tools
    .map((t) => t.tool)
    .filter((name): name is string => typeof name === "string" && name.length > 0);
}

function extractDisplayNameFromResult(result: unknown): string | undefined {
  if (!result) return undefined;
  
  let obj = result;
  if (typeof result === "string") {
    try {
      obj = JSON.parse(result);
    } catch {
      return undefined;
    }
  }
  
  if (!obj || typeof obj !== "object") return undefined;
  if ("name" in obj) {
    const name = (obj as { name?: unknown }).name;
    if (typeof name === "string" && name.length > 0) return name;
  }
  if ("handle" in obj) {
    const handle = (obj as { handle?: unknown }).handle;
    if (typeof handle === "string" && handle.length > 0) return handle;
  }
  return undefined;
}

/**
 * Groups tool calls under their parent skill:load calls for nested display.
 */
function groupToolCallsBySkill(toolCalls: TraceToolCall[]): TraceToolCall[] {
  const skillLoads: TraceToolCall[] = [];

  for (const tc of toolCalls) {
    const isSkillLoad = tc.isSkillLoad ?? isSkillLoadToolName(tc.toolName);
    if (isSkillLoad) {
      const extractedToolNames = tc.skillToolNames ?? extractSkillToolNamesFromResult(tc.result);
      skillLoads.push({
        ...tc,
        isSkillLoad: true,
        childToolCalls: [],
        skillToolNames: extractedToolNames,
        displayName: tc.displayName ?? extractDisplayNameFromResult(tc.result),
      });
    }
  }

  if (skillLoads.length === 0) return toolCalls;

  const toolNameToSkill = new Map<string, TraceToolCall>();
  for (const skill of skillLoads) {
    for (const toolName of skill.skillToolNames ?? []) {
      toolNameToSkill.set(toolName, skill);
    }
  }

  const assignedIds = new Set<string>();

  // Helper to find owner by exact match or suffix match (e.g., "update_prospect" matches "system:crm:prospect:update")
  const findOwner = (toolName: string): TraceToolCall | undefined => {
    // Exact match first
    let owner = toolNameToSkill.get(toolName);
    if (owner) return owner;
    
    // Try suffix match: tool name without underscores matches end of registered name
    const normalizedToolName = toolName.replace(/_/g, ':');
    for (const [registeredName, skill] of toolNameToSkill.entries()) {
      if (registeredName.endsWith(`:${normalizedToolName}`) || registeredName.endsWith(`:${toolName}`)) {
        return skill;
      }
      // Also check if registered name contains the tool handle (e.g., "prospect:update" in "system:crm:prospect:update")
      const toolParts = toolName.split('_');
      if (toolParts.length >= 2) {
        const pattern = toolParts.join(':');
        if (registeredName.includes(pattern)) {
          return skill;
        }
      }
    }
    return undefined;
  };

  // Assign by skill tool registry
  for (const tc of toolCalls) {
    if (tc.isSkillLoad ?? isSkillLoadToolName(tc.toolName)) continue;
    const owner = findOwner(tc.toolName);
    if (owner) {
      owner.childToolCalls = owner.childToolCalls ?? [];
      owner.childToolCalls.push({ ...tc });
      assignedIds.add(tc.toolCallId);
    }
  }

  // Fallback: sequential assignment
  let activeSkill: TraceToolCall | null = null;
  for (const tc of toolCalls) {
    if (tc.isSkillLoad ?? isSkillLoadToolName(tc.toolName)) {
      activeSkill = skillLoads.find((s) => s.toolCallId === tc.toolCallId) ??
        skillLoads.find((s) => s.skillHandle === tc.skillHandle) ??
        activeSkill;
      continue;
    }
    if (assignedIds.has(tc.toolCallId)) continue;
    if (activeSkill) {
      activeSkill.childToolCalls = activeSkill.childToolCalls ?? [];
      activeSkill.childToolCalls.push({ ...tc });
      assignedIds.add(tc.toolCallId);
    }
  }

  const orphans = toolCalls.filter(
    (tc) => !(tc.isSkillLoad ?? isSkillLoadToolName(tc.toolName)) && !assignedIds.has(tc.toolCallId),
  );

  return [...skillLoads, ...orphans];
}

/**
 * Prints a nested trace summary showing tools grouped under skills.
 */
function printNestedTrace(toolCalls: TraceToolCall[], thoughts?: Array<{ content: string; durationMs?: number }>): void {
  if (toolCalls.length === 0 && (!thoughts || thoughts.length === 0)) return;

  console.log('\x1b[2m\n  ─── Trace Summary ───\x1b[0m')
  
  // Print agent-level thoughts first
  if (thoughts && thoughts.length > 0) {
    for (const t of thoughts) {
      const durationStr = t.durationMs ? ` (${t.durationMs}ms)` : ''
      console.log(`\x1b[2m  💭 ${t.content.slice(0, 100)}${t.content.length > 100 ? '...' : ''}${durationStr}\x1b[0m`)
    }
  }
  
  const grouped = groupToolCallsBySkill(toolCalls)
  
  for (const tc of grouped) {
    const isSkillLoad = tc.isSkillLoad ?? isSkillLoadToolName(tc.toolName)
    
    if (isSkillLoad) {
      const name = tc.displayName || tc.skillHandle || 'Skill'
      const durationStr = tc.durationMs ? ` (${tc.durationMs}ms)` : ''
      console.log(`\x1b[35m  📚 ${name}${durationStr}\x1b[0m`)
      
      // Print child tool calls or "(no tools called)"
      const childCalls = tc.childToolCalls ?? []
      if (childCalls.length === 0) {
        console.log(`\x1b[2m      (no tools called)\x1b[0m`)
      } else {
        for (const child of childCalls) {
          const childName = child.displayName || formatToolDisplayName(child.toolName, child.args)
          const childDuration = child.durationMs ? ` (${child.durationMs}ms)` : ''
          console.log(`\x1b[36m      🔧 ${childName}${childDuration}\x1b[0m`)
          
          // Show key args
          if (child.args && Object.keys(child.args).length > 0) {
            const argsToShow = Object.entries(child.args).filter(
              ([key, value]) => key !== 'id' && value !== null && value !== undefined
            ).slice(0, 3)
            for (const [key, value] of argsToShow) {
              const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value)
              console.log(`\x1b[2m          ${key}: ${displayValue.slice(0, 50)}${displayValue.length > 50 ? '...' : ''}\x1b[0m`)
            }
          }
        }
      }
    } else {
      // Orphan tool call (not under any skill)
      const name = tc.displayName || formatToolDisplayName(tc.toolName, tc.args)
      const durationStr = tc.durationMs ? ` (${tc.durationMs}ms)` : ''
      console.log(`\x1b[36m  🔧 ${name}${durationStr}\x1b[0m`)
      
      // Show key args for orphan tools too
      if (tc.args && Object.keys(tc.args).length > 0) {
        const argsToShow = Object.entries(tc.args).filter(
          ([key, value]) => key !== 'id' && value !== null && value !== undefined
        ).slice(0, 3)
        for (const [key, value] of argsToShow) {
          const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value)
          console.log(`\x1b[2m      ${key}: ${displayValue.slice(0, 50)}${displayValue.length > 50 ? '...' : ''}\x1b[0m`)
        }
      }
    }
  }
  
  console.log('\x1b[2m  ─────────────────────\x1b[0m')
}

function formatToolDisplayName(toolName: string, args?: Record<string, unknown>): string {
  if (toolName === 'system:skill:load') {
    const skillName = args?.name || 'unknown'
    return `Load Skill: ${skillName}`
  }
  
  const parts = toolName.split(':')
  const lastPart = parts[parts.length - 1]
  if (lastPart === 'stage') return 'Update Stage'
  if (lastPart === 'update') return 'Update Record'
  return lastPart.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
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
  sandbox?: boolean,
  mockContext?: MockContext,
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  toolHistory?: ToolHistoryEntry[],
): Promise<AsyncGenerator<ChatEvent>> {
  const url = `${serverUrl}/api/cli/chat?workplaceId=${encodeURIComponent(workplaceId)}`

  debug('Sending to:', url)
  debug('Sandbox mode:', sandbox)
  if (mockContext) {
    debug('Mock context:', JSON.stringify(mockContext))
  }
  if (chatHistory && chatHistory.length > 0) {
    debug('Chat history:', chatHistory.length, 'messages')
  }
  if (toolHistory && toolHistory.length > 0) {
    debug('Tool history:', toolHistory.length, 'tool calls')
  }

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
      sandbox,
      mockContext,
      chatHistory: sandbox && chatHistory && chatHistory.length > 0 ? chatHistory : undefined,
      toolHistory: sandbox && toolHistory && toolHistory.length > 0 ? toolHistory : undefined,
      currentTime: new Date().toISOString(),
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

  // Parse sandbox flags
  const sandbox = !!flags.sandbox
  const mockContextPath = flags['mock-context'] as string | undefined
  const mockSenderStr = flags['mock-sender'] as string | undefined

  // Build mock context if in sandbox mode
  let mockContext: MockContext | undefined
  if (sandbox) {
    try {
      if (mockContextPath) {
        mockContext = loadMockContext(mockContextPath)
      } else if (mockSenderStr) {
        const sender = parseMockSender(mockSenderStr)
        mockContext = buildMockContext(sender)
      } else {
        // Default mock context for sandbox
        mockContext = buildMockContext({
          displayName: 'Test User',
          kind: 'contact',
        })
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
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
  const sandboxLabel = sandbox ? ' [SANDBOX]' : ''
  console.log(`\x1b[1mSkedyul Chat\x1b[0m (${agentHandle}${versionLabel})${sandboxLabel}`)
  if (sandbox && mockContext) {
    console.log(`\x1b[2mMock sender: ${mockContext.sender.displayName} (${mockContext.sender.kind})\x1b[0m`)
  }
  if (Object.keys(inputs).length > 0) {
    const inputsStr = Object.entries(inputs).map(([k, v]) => `${k}=${v}`).join(', ')
    console.log(`\x1b[2mInputs: ${inputsStr}\x1b[0m`)
  }
  console.log('\x1b[2m' + '─'.repeat(50) + '\x1b[0m')
  console.log('\x1b[2mType /help for commands, Ctrl+C to exit\x1b[0m')
  console.log('')

  let threadId: string | undefined
  let chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  let toolHistory: ToolHistoryEntry[] = []

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
      if (sandbox) {
        console.log('  /context      Show mock context')
      }
      console.log('  /help         Show this help')
      console.log('')
      return true
    }

    if (trimmed === '/clear') {
      threadId = undefined
      chatHistory = []
      toolHistory = []
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

    if (trimmed === '/context') {
      if (!sandbox || !mockContext) {
        console.log('\n\x1b[2mNot in sandbox mode.\x1b[0m\n')
      } else {
        console.log('')
        console.log('\x1b[1mMock Context:\x1b[0m')
        console.log(JSON.stringify(mockContext, null, 2))
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
        sandbox,
        mockContext,
        chatHistory,
        toolHistory,
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
      let pendingToolArgs: Map<string, Record<string, unknown>> = new Map() // Track tool call args for display
      
      // Collected events for end-of-turn trace summary
      const turnToolCalls: TraceToolCall[] = []
      const turnSkillLoads: TraceToolCall[] = []
      const turnThoughts: Array<{ content: string; durationMs?: number }> = []

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
            // Collect completed thought for trace summary
            turnThoughts.push({ content: event.thought, durationMs: event.durationMs })
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
            // Collect completed thought for trace summary
            turnThoughts.push({ content: event.thought, durationMs: thoughtDuration || undefined })
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

        // Collect tool calls for end-of-turn trace summary
        if (event.toolCall) {
          debug('Tool call event received:', event.toolCall.name, event.toolCall.status, 'messageStarted:', messageStarted)
          
          if (!messageStarted) {
            // Clear any in-progress thought
            if (currentThought) {
              clearLine()
              currentThought = ''
              thoughtStartTime = null
            }
            
            const tc = event.toolCall as { name: string; status: string; args?: Record<string, unknown>; durationMs?: number; resultSummary?: string; autoApproved?: boolean }
            const isSkillLoad = tc.name === 'system:skill:load' || tc.name === 'load_skill'
            
            // Create a unique key for tracking tool calls (handles parallel calls to same tool)
            const getToolKey = (name: string, args?: Record<string, unknown>): string => {
              if ((name === 'system:skill:load' || name === 'load_skill') && args?.name) {
                return `${name}:${args.name}`
              }
              if (args && Object.keys(args).length > 0) {
                const argsStr = JSON.stringify(args)
                return `${name}:${argsStr.slice(0, 50)}`
              }
              return name
            }
            
            const toolKey = getToolKey(tc.name, tc.args)
            
            if (tc.status === 'started') {
              pendingToolCalls.set(toolKey, now)
              if (tc.args) {
                pendingToolArgs.set(toolKey, tc.args)
              }
              
              // For skill loading, show "Skill Added" notification inline
              if (isSkillLoad) {
                const skillName = tc.args?.name || 'unknown'
                console.log(`\x1b[35m  [Skill Added] ${skillName}...\x1b[0m`)
              }
              // Regular tools are collected silently - shown in trace summary
            } else if (tc.status === 'completed') {
              let matchedKey = toolKey
              let storedArgs: Record<string, unknown> | undefined = pendingToolArgs.get(toolKey)
              
              if (!storedArgs && !tc.args) {
                for (const [key, args] of pendingToolArgs.entries()) {
                  if (key.startsWith(tc.name)) {
                    matchedKey = key
                    storedArgs = args
                    break
                  }
                }
              }
              
              const argsForDisplay = tc.args || storedArgs
              const duration = tc.durationMs || (pendingToolCalls.has(matchedKey) ? now - pendingToolCalls.get(matchedKey)! : 0)
              pendingToolCalls.delete(matchedKey)
              pendingToolArgs.delete(matchedKey)
              
              // Parse result for skill tool names
              let result: unknown = undefined
              let skillToolNames: string[] = []
              if (tc.resultSummary) {
                try {
                  result = JSON.parse(tc.resultSummary)
                  skillToolNames = extractSkillToolNamesFromResult(result)
                } catch {
                  // ignore parse errors
                }
              }
              
              // Build the trace tool call entry
              const traceToolCall: TraceToolCall = {
                toolCallId: `${tc.name}-${Date.now()}`,
                toolName: tc.name,
                displayName: extractDisplayNameFromResult(result) || (argsForDisplay?.name as string),
                args: argsForDisplay || {},
                result,
                durationMs: duration,
                isSkillLoad,
                skillHandle: isSkillLoad ? (argsForDisplay?.name as string) : undefined,
                skillToolNames: isSkillLoad ? skillToolNames : undefined,
              }
              
              if (isSkillLoad) {
                // Update the "Skill Added" notification with completion
                clearLine()
                const skillName = traceToolCall.displayName || argsForDisplay?.name || 'Skill'
                const durationStr = duration ? ` (${duration}ms)` : ''
                console.log(`\x1b[35m  [Skill Added] ${skillName} ✓${durationStr}\x1b[0m`)
                turnSkillLoads.push(traceToolCall)
              } else {
                // Regular tools are collected for trace summary
                turnToolCalls.push(traceToolCall)
              }
            } else if (tc.status === 'failed') {
              const duration = pendingToolCalls.has(toolKey) ? now - pendingToolCalls.get(toolKey)! : 0
              pendingToolCalls.delete(toolKey)
              pendingToolArgs.delete(toolKey)
              
              // Show failed tools inline since they need attention
              const displayName = formatToolDisplayName(tc.name, tc.args)
              const durationStr = duration ? ` (${duration}ms)` : ''
              console.log(`\x1b[31m  [Tool] ${displayName} ✗ failed${durationStr}\x1b[0m`)
            }
          } else {
            debug('Skipping tool call display because messageStarted is true')
          }
        }

        // Handle pending approval requests (only in non-sandbox mode)
        // In sandbox mode, tools are auto-approved so this won't be triggered
        if (event.pendingApproval && !messageStarted) {
          // Clear any in-progress thought
          if (currentThought) {
            clearLine()
            currentThought = ''
            thoughtStartTime = null
          }

          const approval = event.pendingApproval
          const indent = event.isChildAgent ? '      ' : '  '
          
          // Show the tool that needs approval
          console.log(`\n\x1b[33m${indent}[Approval Required] ${approval.displayName}\x1b[0m`)
          
          // Show the args that will be used
          if (approval.args && Object.keys(approval.args).length > 0) {
            const argsToShow = Object.entries(approval.args).filter(
              ([key, value]) => key !== 'id' && value !== null && value !== undefined
            )
            for (const [key, value] of argsToShow) {
              const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value)
              console.log(`\x1b[33m${indent}  ${key}: ${displayValue}\x1b[0m`)
            }
          }
          
          // In production mode, this would prompt for approval
          // For now, just show that approval is required
          console.log(`\x1b[33m${indent}  (Approval flow not yet implemented for non-sandbox mode)\x1b[0m`)
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

        // Handle message events - since we sanitize on the server, just track the latest message
        // and display it when done (no streaming needed)
        if (event.message !== undefined && event.message !== lastMessage) {
          // Skip if this is just an echo of the user's input
          const isUserEcho = event.message.toLowerCase() === userInput.toLowerCase()
          if (isUserEcho) {
            debug('Skipping user input echo:', JSON.stringify(event.message))
            lastMessage = event.message
            continue
          }
          
          debug('Message event - last:', JSON.stringify(lastMessage), 'new:', JSON.stringify(event.message))
          lastMessage = event.message
        }

              if (event.done) {
                const totalTime = Date.now() - requestStartTime
                
                // Debug: log the full event to see if updatedMockContext is present
                debug('Final event received:', JSON.stringify(event).slice(0, 500))
                
                // Display the final sanitized message
                if (lastMessage) {
                  // Clear any in-progress thought before showing message
                  if (currentThought) {
                    clearLine()
                    currentThought = ''
                  }
                  const displayName = currentAgentName || 'Agent'
                  console.log(`\n\x1b[1m${displayName}:\x1b[0m ${lastMessage}`)
                }
                
                // Merge final thoughts from server if available (may include thoughts not streamed)
                if (event.thoughts && Array.isArray(event.thoughts)) {
                  for (const t of event.thoughts) {
                    // Only add if not already in turnThoughts (avoid duplicates)
                    if (!turnThoughts.some(existing => existing.content === t.content)) {
                      turnThoughts.push({ content: t.content, durationMs: t.durationMs })
                    }
                  }
                }
                
                // Print the nested trace summary with skills and tool calls grouped
                const allToolCalls = [...turnSkillLoads, ...turnToolCalls]
                if (allToolCalls.length > 0 || turnThoughts.length > 0) {
                  printNestedTrace(allToolCalls, turnThoughts)
                }
                
                console.log(`\x1b[2m  Total: ${totalTime}ms\x1b[0m`)
                
                // Update mock context with server's updated version (for sandbox mode)
                // This preserves CRM updates across conversation turns
                if (sandbox && event.updatedMockContext) {
                  const oldGoals = mockContext?.contexts?.find(c => c.model === 'prospect')?.data?.goals
                  mockContext = event.updatedMockContext as MockContext
                  const newGoals = mockContext?.contexts?.find(c => c.model === 'prospect')?.data?.goals
                  debug('Mock context updated from server. Old goals:', JSON.stringify(oldGoals), 'New goals:', JSON.stringify(newGoals))
                } else if (sandbox) {
                  debug('No updatedMockContext in event. Event keys:', Object.keys(event))
                }
                
                // Update chat history with this exchange (for sandbox mode)
                if (sandbox && lastMessage) {
                  chatHistory.push({ role: 'user', content: trimmed })
                  chatHistory.push({ role: 'assistant', content: lastMessage })
                  debug('Chat history updated, now', chatHistory.length, 'messages')
                }
                
                // Accumulate tool calls from this turn (for sandbox mode)
                if (sandbox && event.toolCalls && event.toolCalls.length > 0) {
                  const newToolCalls: ToolHistoryEntry[] = event.toolCalls.map(tc => ({
                    toolCallId: tc.toolCallId,
                    toolName: tc.toolName,
                    args: tc.args,
                    result: tc.result,
                    timestamp: Date.now(),
                    providerOptions: tc.providerOptions,
                  }))
                  toolHistory.push(...newToolCalls)
                  debug('Tool history updated, now', toolHistory.length, 'tool calls')
                  
                }
                
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
