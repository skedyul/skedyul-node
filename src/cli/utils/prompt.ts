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
 * Prompt for user input.
 */
export async function prompt(options: PromptOptions): Promise<string> {
  const { message, default: defaultValue, required = false, hidden = false } = options

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  // For hidden input, we need to handle it differently
  if (hidden) {
    return new Promise((resolve) => {
      let muted = false
      const originalWrite = process.stdout.write.bind(process.stdout)

      // Temporarily override stdout.write to hide input
      process.stdout.write = ((
        chunk: string | Uint8Array,
        encoding?: BufferEncoding | ((err?: Error | null) => void),
        cb?: (err?: Error | null) => void,
      ): boolean => {
        if (muted) {
          return true
        }
        if (typeof encoding === 'function') {
          return originalWrite(chunk, encoding)
        }
        return originalWrite(chunk, encoding, cb)
      }) as typeof process.stdout.write

      const displayMessage = defaultValue
        ? `${message} [${defaultValue}]: `
        : `${message}: `

      rl.question(displayMessage, (answer) => {
        muted = false
        process.stdout.write = originalWrite
        process.stdout.write('\n')
        rl.close()

        const value = answer.trim() || defaultValue || ''

        if (required && !value) {
          console.error('Value is required.')
          resolve(prompt(options))
          return
        }

        resolve(value)
      })

      muted = true
    })
  }

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
