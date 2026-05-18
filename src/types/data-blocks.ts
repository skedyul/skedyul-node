/**
 * DataBlock types for rich UI rendering of tool results.
 * Apps can include dataBlocks in their tool responses to control
 * how results are displayed in the agent chat UI.
 */

/**
 * Link structure for navigating to CRM views or external URLs.
 */
export interface DataBlockLink {
  modelHandle?: string
  modelHandlePlural?: string
  modelLabel?: string
  recordId?: string
  filters?: Record<string, unknown>
  url?: string
}

/**
 * Column definition for spreadsheet blocks.
 */
export interface SpreadsheetColumn {
  id: string
  label: string
  type?: string
}

/**
 * Spreadsheet block - tabular data with preview rows.
 */
export interface SpreadsheetBlock {
  type: 'spreadsheet'
  title: string
  columns: SpreadsheetColumn[]
  data: Array<{ id: string; [key: string]: unknown }>
  totalRows: number
  link?: DataBlockLink
}

/**
 * Avatar configuration for profile blocks.
 */
export interface ProfileAvatar {
  initials?: string
  imageUrl?: string
}

/**
 * Field entry for profile blocks.
 */
export interface ProfileField {
  label: string
  value: string
}

/**
 * Profile block - entity card with key fields.
 */
export interface ProfileBlock {
  type: 'profile'
  title: string
  subtitle?: string
  avatar?: ProfileAvatar
  fields: ProfileField[]
  link?: DataBlockLink
}

/**
 * Field change entry showing old → new value transition.
 */
export interface FieldChangeItem {
  label: string
  oldValue: string | null
  newValue: string | null
  error?: { code: string; message: string }
}

/**
 * Field changes block - shows old → new value transitions.
 */
export interface FieldChangesBlock {
  type: 'fieldChanges'
  title: string
  subtitle?: string
  changes: FieldChangeItem[]
  link?: DataBlockLink
}

/**
 * DateTime block - shows a calendar event/appointment with status.
 */
export interface DateTimeBlock {
  type: 'dateTime'
  title: string
  subtitle?: string
  datetime: string
  timezone?: string
  duration?: number
  location?: string
  status?: 'confirmed' | 'pending' | 'cancelled'
  icon?: 'calendar' | 'clock' | 'check'
  link?: DataBlockLink
}

/**
 * Union of all data block types.
 * Tools can return these in their results to be forwarded to the UI.
 */
export type DataBlock =
  | SpreadsheetBlock
  | ProfileBlock
  | FieldChangesBlock
  | DateTimeBlock
