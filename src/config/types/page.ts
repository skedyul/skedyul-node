// ─────────────────────────────────────────────────────────────────────────────
// Page Definition
// ─────────────────────────────────────────────────────────────────────────────

export type PageType = 'INSTANCE' | 'LIST'
export type PageBlockType = 'form' | 'spreadsheet' | 'kanban' | 'calendar' | 'link' | 'list' | 'card'
export type PageFieldType = 'STRING' | 'FILE' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'SELECT' | 'FORM' | 'RELATIONSHIP'

export interface PageFieldSource {
  model: string
  field: string
}

export interface PageFormHeader {
  title: string
  description?: string
}

export interface PageActionDefinition {
  handle: string
  /** Button label - supports Liquid templates e.g. "{{ compliance_records[0].status == 'APPROVED' ? 'Register' : 'Pending' }}" */
  label: string
  handler: string
  icon?: string
  variant?: 'primary' | 'secondary' | 'destructive'
  /** Whether the action is disabled - boolean or Liquid template string e.g. "{{ compliance_records[0].status != 'APPROVED' }}" */
  isDisabled?: boolean | string
  /** Whether the action is hidden - boolean or Liquid template string */
  isHidden?: boolean | string
}

// ─────────────────────────────────────────────────────────────────────────────
// FormV2 Component Definitions (mirrors skedyul-ui FormComponentV2)
// ─────────────────────────────────────────────────────────────────────────────

/** Base style props for FormV2 components */
export interface FormV2StyleProps {
  id: string
  row: number
  col: number
  className?: string
  hidden?: boolean
}

/** Button props for FieldSetting component */
export interface FieldSettingButtonProps {
  label: string
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  isLoading?: boolean
  /** Can be boolean or Liquid template string that resolves to boolean */
  isDisabled?: boolean | string
  leftIcon?: string
}

/** Relationship extension for dynamic data loading */
export interface RelationshipExtension {
  model: string
}

/** Modal form definition for nested forms (handled by skedyul-web, not skedyul-ui) */
export interface ModalFormDefinition {
  header: PageFormHeader
  handler: string
  /** Named dialog template to use instead of inline fields */
  template?: string
  /** Template-specific params to pass to the dialog */
  templateParams?: Record<string, unknown>
  /** Inline field definitions (used when template is not specified) */
  fields?: FormV2ComponentDefinition[]
  layout?: FormLayoutConfigDefinition
  actions?: PageActionDefinition[]
}

/** Input component definition */
export interface InputComponentDefinition extends FormV2StyleProps {
  component: 'Input'
  props: {
    label?: string
    placeholder?: string
    helpText?: string
    type?: 'text' | 'number' | 'email' | 'password' | 'tel' | 'url' | 'hidden'
    required?: boolean
    disabled?: boolean
    value?: string | number
  }
}

/** Textarea component definition */
export interface TextareaComponentDefinition extends FormV2StyleProps {
  component: 'Textarea'
  props: {
    label?: string
    placeholder?: string
    helpText?: string
    required?: boolean
    disabled?: boolean
    value?: string
  }
}

/** Select component definition */
export interface SelectComponentDefinition extends FormV2StyleProps {
  component: 'Select'
  props: {
    label?: string
    placeholder?: string
    helpText?: string
    /** Static items array (will be populated by iterable if using dynamic items) */
    items?: Array<{ value: string; label: string }> | string
    value?: string
    isDisabled?: boolean
    required?: boolean
  }
  /** For relationship-based selects */
  relationship?: RelationshipExtension
  /** For dynamic items using iterable pattern (e.g., 'system.models') */
  iterable?: string
  /** Template for each item in the iterable */
  itemTemplate?: {
    value: string
    label: string
  }
}

/** Combobox component definition */
export interface ComboboxComponentDefinition extends FormV2StyleProps {
  component: 'Combobox'
  props: {
    label?: string
    placeholder?: string
    helpText?: string
    items?: Array<{ value: string; label: string }>
    value?: string
  }
  /** For relationship-based comboboxes */
  relationship?: RelationshipExtension
}

/** Checkbox component definition */
export interface CheckboxComponentDefinition extends FormV2StyleProps {
  component: 'Checkbox'
  props: {
    label?: string
    helpText?: string
    checked?: boolean
    disabled?: boolean
  }
}

/** DatePicker component definition */
export interface DatePickerComponentDefinition extends FormV2StyleProps {
  component: 'DatePicker'
  props: {
    label?: string
    helpText?: string
    value?: string | Date
    disabled?: boolean
  }
}

/** TimePicker component definition */
export interface TimePickerComponentDefinition extends FormV2StyleProps {
  component: 'TimePicker'
  props: {
    label?: string
    helpText?: string
    value?: string
    disabled?: boolean
  }
}

/** FieldSetting component definition (button that can open modal) */
export interface FieldSettingComponentDefinition extends FormV2StyleProps {
  component: 'FieldSetting'
  props: {
    label: string
    description?: string
    helpText?: string
    mode?: 'field' | 'setting'
    /** Status indicator: 'success', 'pending', 'error', 'warning' - can be Liquid template */
    status?: 'success' | 'pending' | 'error' | 'warning' | string
    /** Text to display alongside status badge - can be Liquid template */
    statusText?: string
    button: FieldSettingButtonProps
  }
  /** Nested modal form (handled by skedyul-web) */
  modalForm?: ModalFormDefinition
}

/** ImageSetting component definition */
export interface ImageSettingComponentDefinition extends FormV2StyleProps {
  component: 'ImageSetting'
  props: {
    label?: string
    description?: string
    helpText?: string
    accept?: string
  }
}

/** FileSetting component definition for file uploads */
export interface FileSettingComponentDefinition extends FormV2StyleProps {
  component: 'FileSetting'
  props: {
    label?: string
    description?: string
    helpText?: string
    accept?: string
    required?: boolean
    button?: {
      label?: string
      variant?: 'default' | 'outline' | 'ghost' | 'link'
      size?: 'sm' | 'md' | 'lg'
    }
  }
}

/** Item template for server-side iterable rendering */
export interface ListItemTemplate {
  component: string
  span?: number
  mdSpan?: number
  lgSpan?: number
  props: Record<string, unknown>
}

/** List component definition */
export interface ListComponentDefinition extends FormV2StyleProps {
  component: 'List'
  props: {
    title?: string
    items?: Array<{ id: string; label: string; description?: string }>
    emptyMessage?: string
  }
  /** Model to fetch list items from (legacy) */
  model?: string
  labelField?: string
  descriptionField?: string
  icon?: string
  /** Context variable name to iterate over (e.g., 'phone_numbers') */
  iterable?: string
  /** Template for each item - use {{ item.xyz }} for field values */
  itemTemplate?: ListItemTemplate
}

/** EmptyForm component definition */
export interface EmptyFormComponentDefinition extends FormV2StyleProps {
  component: 'EmptyForm'
  props: {
    title?: string
    description?: string
    icon?: string
  }
}

/** Alert component definition for display-only informational content */
export interface AlertComponentDefinition extends FormV2StyleProps {
  component: 'Alert'
  props: {
    title: string
    description: string
    icon?: string
    variant?: 'default' | 'destructive'
  }
}

/** Union of all FormV2 component definitions */
export type FormV2ComponentDefinition =
  | InputComponentDefinition
  | TextareaComponentDefinition
  | SelectComponentDefinition
  | ComboboxComponentDefinition
  | CheckboxComponentDefinition
  | DatePickerComponentDefinition
  | TimePickerComponentDefinition
  | FieldSettingComponentDefinition
  | ImageSettingComponentDefinition
  | FileSettingComponentDefinition
  | ListComponentDefinition
  | EmptyFormComponentDefinition
  | AlertComponentDefinition

/** Layout column definition */
export interface FormLayoutColumnDefinition {
  field: string
  colSpan: number
  dataType?: string
  subQuery?: unknown
}

/** Layout row definition */
export interface FormLayoutRowDefinition {
  columns: FormLayoutColumnDefinition[]
}

/** FormLayoutConfig definition (mirrors skedyul-ui FormLayoutConfig) */
export interface FormLayoutConfigDefinition {
  type: 'form'
  rows: FormLayoutRowDefinition[]
}

/** FormV2 props definition */
export interface FormV2PropsDefinition {
  formVersion: 'v2'
  id?: string
  fields: FormV2ComponentDefinition[]
  layout: FormLayoutConfigDefinition
  /** Optional actions that trigger MCP tool calls */
  actions?: PageActionDefinition[]
}

/** Card block header definition */
export interface CardBlockHeader {
  title: string
  description?: string
  descriptionHref?: string
}

/** Card block definition (CardV2-aligned) */
export interface CardBlockDefinition {
  type: 'card'
  /** Disable drag-and-drop in the form */
  restructurable?: boolean
  header?: CardBlockHeader
  form: FormV2PropsDefinition
  actions?: PageActionDefinition[]
  secondaryActions?: PageActionDefinition[]
  primaryActions?: PageActionDefinition[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy Page Field Definition (for backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────

export interface PageFieldDefinition {
  handle: string
  type: PageFieldType
  label: string
  description?: string
  required?: boolean
  handler?: string
  source?: PageFieldSource
  options?: Array<{ value: string; label: string }>
  accept?: string
  header?: PageFormHeader
  fields?: PageFieldDefinition[]
  actions?: PageActionDefinition[]
  /** Target internal model handle for RELATIONSHIP type fields */
  model?: string
}

/** Legacy form block definition */
export interface LegacyFormBlockDefinition {
  type: 'form' | 'spreadsheet' | 'kanban' | 'calendar' | 'link'
  title?: string
  fields?: PageFieldDefinition[]
  readonly?: boolean
}

/** List block definition */
export interface ListBlockDefinition {
  type: 'list'
  title?: string
  /** Model handle to fetch instances from */
  model: string
  /** Field to use as the tile label */
  labelField?: string
  /** Field to use as the tile description */
  descriptionField?: string
  /** Icon for each tile */
  icon?: string
  /** Message when no items */
  emptyMessage?: string
}

/** Model mapper block definition - for mapping SHARED models to workspace models */
export interface ModelMapperBlockDefinition {
  type: 'model-mapper'
  /** The SHARED model handle from provision config (e.g., "client", "patient") */
  model: string
}

/** Union of all block types */
export type PageBlockDefinition = CardBlockDefinition | LegacyFormBlockDefinition | ListBlockDefinition | ModelMapperBlockDefinition

/** Mode for context data fetching */
export type PageContextMode = 'first' | 'many' | 'count'

/**
 * Page context filters using structured format.
 * Format: { fieldHandle: { operator: value } }
 * Values can be Liquid template strings, e.g., { id: { eq: '{{ path_params.id }}' } }
 */
export type PageContextFilters = Record<
  string,
  Record<string, string | number | boolean | (string | number | boolean)[]>
>

/** Single context item definition (model-based) */
export interface PageContextItemDefinition {
  /** Model handle to fetch data from */
  model: string
  /** Fetch mode: 'first' returns single object, 'many' returns array, 'count' returns number */
  mode: PageContextMode
  /**
   * Optional filters. Supports:
   * - Simple key-value with Liquid templates: { id: '{{ path_params.id }}' }
   * - StructuredFilter format: { status: { eq: 'APPROVED' } }
   */
  filters?: PageContextFilters
  /** Optional limit for 'many' mode */
  limit?: number
}

/** Single context item definition (tool-based) */
export interface PageContextToolItemDefinition {
  /** Tool name to invoke for fetching context data */
  tool: string
}

/** Context definition: variable name -> context item (model or tool-based) */
export type PageContextDefinition = Record<string, PageContextItemDefinition | PageContextToolItemDefinition>

/** @deprecated Use PageContextDefinition instead */
export interface PageInstanceFilter {
  model: string
  where?: Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation Definitions
// ─────────────────────────────────────────────────────────────────────────────

/** Navigation item for sidebar */
export interface NavigationItem {
  /** Display label (supports Liquid templates) */
  label: string
  /** URL href (supports Liquid templates with path_params and context) */
  href: string
  /** Optional icon name */
  icon?: string
}

/** Navigation section with title and items */
export interface NavigationSection {
  /** Section title (supports Liquid templates) */
  title?: string
  /** Navigation items in this section */
  items: NavigationItem[]
}

/** Sidebar navigation configuration */
export interface NavigationSidebar {
  /** Sections to display in the sidebar */
  sections: NavigationSection[]
}

/** Breadcrumb item */
export interface BreadcrumbItem {
  /** Display label (supports Liquid templates) */
  label: string
  /** Optional href - if not provided, item is not clickable */
  href?: string
}

/** Breadcrumb navigation configuration */
export interface NavigationBreadcrumb {
  /** Breadcrumb items from left to right */
  items: BreadcrumbItem[]
}

/** Full navigation configuration */
export interface NavigationConfig {
  /** Sidebar navigation */
  sidebar?: NavigationSidebar
  /** Breadcrumb navigation */
  breadcrumb?: NavigationBreadcrumb
}

export interface PageDefinition {
  type: PageType
  title: string
  /** URL path for this page (e.g., '/phone-numbers' or '/phone-numbers/[id]' for dynamic segments) */
  path: string
  /** When true, this page is the default landing page for the app installation */
  default?: boolean
  /**
   * Navigation configuration:
   * - true/false: show/hide in auto-generated navigation
   * - string: Liquid template that evaluates to true/false
   * - NavigationConfig: full navigation override for this page (replaces base navigation)
   */
  navigation?: boolean | string | NavigationConfig
  blocks: PageBlockDefinition[]
  actions?: PageActionDefinition[]
  /** Context data to load for Liquid templates. appInstallationId filtering is automatic. */
  context?: PageContextDefinition
  /** @deprecated Use context instead */
  filter?: PageInstanceFilter
}
