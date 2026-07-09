/** GSM 7-bit default alphabet (3GPP TS 23.038). */
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'

/** GSM 7-bit extension table characters (each counts as 2 septets). */
const GSM7_EXTENDED = '^{}\\[~]|€'

const GSM7_BASIC_SET = new Set(GSM7_BASIC.split(''))
const GSM7_EXTENDED_SET = new Set(GSM7_EXTENDED.split(''))

export type SmsEncoding = 'GSM-7' | 'UCS-2'

export type SmsSegmentEstimate = {
  encoding: SmsEncoding
  characters: number
  septets?: number
  segments: number
}

/** Strip characters that are not encodable in GSM-7. */
export function toGsm7(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  const str = String(value)
  let result = ''

  for (const char of str) {
    if (GSM7_BASIC_SET.has(char) || GSM7_EXTENDED_SET.has(char)) {
      result += char
    }
  }

  return result
}

function isGsm7Character(char: string): boolean {
  return GSM7_BASIC_SET.has(char) || GSM7_EXTENDED_SET.has(char)
}

function countGsm7Septets(text: string): number {
  let septets = 0
  for (const char of text) {
    septets += GSM7_EXTENDED_SET.has(char) ? 2 : 1
  }
  return septets
}

/** Estimate SMS segment count for a message body. */
export function estimateSmsSegments(text: string): SmsSegmentEstimate {
  const normalized = text ?? ''
  const characters = [...normalized].length

  if (characters === 0) {
    return { encoding: 'GSM-7', characters: 0, septets: 0, segments: 0 }
  }

  const isGsm7 = [...normalized].every(isGsm7Character)

  if (isGsm7) {
    const septets = countGsm7Septets(normalized)
    const segments = septets <= 160 ? 1 : Math.ceil(septets / 153)

    return {
      encoding: 'GSM-7',
      characters,
      septets,
      segments,
    }
  }

  const segments = characters <= 70 ? 1 : Math.ceil(characters / 67)

  return {
    encoding: 'UCS-2',
    characters,
    segments,
  }
}
