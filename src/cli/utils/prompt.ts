import * as readline from 'readline'

// ─────────────────────────────────────────────────────────────────────────────
// Simple CLI Prompts
// These utilities avoid external dependencies by using Node's readline
// ─────────────────────────────────────────────────────────────────────────────

export interface PromptOptions {
  message: string
  default?: string
  required?: boolean
  hidden?: boolean
}

/**
 * Read a line of input without echoing characters (for secrets).
 * Uses raw stdin mode so keystrokes are captured reliably.
 */
async function promptHidden(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    process.stdout.write(question)
    let input = ''

    const stdin = process.stdin
    const wasRaw = stdin.isRaw
    if (stdin.setRawMode) stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    const onData = (char: string) => {
      if (char === '\n' || char === '\r') {
        stdin.removeListener('data', onData)
        if (stdin.setRawMode) stdin.setRawMode(wasRaw ?? false)
        process.stdout.write('\n')
        rl.close()
        resolve(input.trim())
      } else if (char === '\u0003') {
        process.exit(0)
      } else if (char === '\u007F' || char === '\b') {
        if (input.length > 0) {
          input = input.slice(0, -1)
        }
      } else {
        input += char
      }
    }

    stdin.on('data', onData)
  })
}

/**
 * Prompt for user input.
 */
export async function prompt(options: PromptOptions): Promise<string> {
  const { message, default: defaultValue, required = false, hidden = false } = options

  if (hidden) {
    const hint = defaultValue ? ' (press Enter to keep current)' : ''
    const answer = await promptHidden(`${message}${hint}: `)
    const value = answer || defaultValue || ''

    if (required && !value) {
      console.error('Value is required.')
      return prompt(options)
    }

    return value
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    const displayMessage = defaultValue
      ? `${message} [${defaultValue}]: `
      : `${message}: `

    rl.question(displayMessage, (answer) => {
      rl.close()

      const value = answer.trim() || defaultValue || ''

      if (required && !value) {
        console.error('Value is required.')
        resolve(prompt(options))
        return
      }

      resolve(value)
    })
  })
}

export interface ConfirmOptions {
  message: string
  default?: boolean
}

/**
 * Prompt for yes/no confirmation.
 */
export async function confirm(options: ConfirmOptions): Promise<boolean> {
  const { message, default: defaultValue = false } = options
  const hint = defaultValue ? '[Y/n]' : '[y/N]'

  const answer = await prompt({
    message: `${message} ${hint}`,
    default: defaultValue ? 'y' : 'n',
  })

  const normalized = answer.toLowerCase()
  return normalized === 'y' || normalized === 'yes'
}

export interface SelectOption {
  value: string
  label: string
}

export interface SelectOptions {
  message: string
  options: SelectOption[]
  default?: string
}

/**
 * Prompt to select from a list of options.
 * For simplicity, this uses a numbered list approach.
 */
export async function select(options: SelectOptions): Promise<string> {
  const { message, options: choices, default: defaultValue } = options

  console.log(`\n${message}`)

  choices.forEach((choice, index) => {
    const isDefault = choice.value === defaultValue
    const prefix = isDefault ? '*' : ' '
    console.log(`  ${prefix}${index + 1}. ${choice.label}`)
  })

  const answer = await prompt({
    message: 'Enter number',
    default: defaultValue
      ? String(choices.findIndex((c) => c.value === defaultValue) + 1)
      : undefined,
    required: true,
  })

  const index = parseInt(answer, 10) - 1
  if (index >= 0 && index < choices.length) {
    return choices[index].value
  }

  // Try to match by value
  const matched = choices.find(
    (c) => c.value.toLowerCase() === answer.toLowerCase(),
  )
  if (matched) {
    return matched.value
  }

  console.error('Invalid selection. Please try again.')
  return select(options)
}
