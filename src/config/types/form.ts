/**
 * Form component definition types.
 *
 * Forms are built from components that define input fields,
 * buttons, and other UI elements.
 */

import type { FieldOption } from './base'

/**
 * Base style props for form components.
 */
export interface FormStyleProps {
  /** Unique identifier within the form */
  id: string
  /** Grid row position (1-based) */
  row: number
  /** Grid column position (1-based) */
  col: number
  /** Additional CSS class names */
  className?: string
  /** Whether the component is hidden */
  hidden?: boolean
}

/**
 * Button variant styles.
 */
export type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'

/**
 * Button size options.
 */
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon'

/**
 * Button props for action buttons.
 */
export interface ButtonProps {
  label: string
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  /** Can be boolean or Liquid template string */
  disabled?: boolean | string
  leftIcon?: string
}

/**
 * Relationship extension for dynamic data loading.
 */
export interface RelationshipExtension {
  model: string
}

/**
 * Form header definition.
 */
export interface FormHeader {
  title: string
  description?: string
}

/**
 * Action definition for form buttons.
 */
export interface ActionDefinition {
  handle: string
  /** Button label - supports Liquid templates */
  label: string
  /** Tool handler name */
  handler: string
  icon?: string
  variant?: 'primary' | 'secondary' | 'destructive'
  /** Whether disabled - boolean or Liquid template */
  disabled?: boolean | string
  /** Whether hidden - boolean or Liquid template */
  hidden?: boolean | string
}

/**
 * Modal form definition for nested forms.
 */
export interface ModalFormDefinition {
  header: FormHeader
  handler: string
  /** Named dialog template to use */
  template?: string
  /** Template-specific params */
  templateParams?: Record<string, unknown>
  /** Inline field definitions (used when template is not specified) */
  fields?: FormComponent[]
  layout?: FormLayoutConfig
  actions?: ActionDefinition[]
}

/**
 * Input component definition.
 */
export interface InputComponent extends FormStyleProps {
  component: 'input'
  label?: string
  placeholder?: string
  helpText?: string
  leftIcon?: string
  type?: 'text' | 'number' | 'email' | 'password' | 'tel' | 'url' | 'hidden'
  required?: boolean
  disabled?: boolean
  value?: string | number
}

/**
 * Textarea component definition.
 */
export interface TextareaComponent extends FormStyleProps {
  component: 'textarea'
  label?: string
  placeholder?: string
  helpText?: string
  required?: boolean
  disabled?: boolean
  value?: string
}

/**
 * Select component definition.
 */
export interface SelectComponent extends FormStyleProps {
  component: 'select'
  label?: string
  placeholder?: string
  helpText?: string
  /** Static items or Liquid template string */
  items?: FieldOption[] | string
  value?: string
  disabled?: boolean
  required?: boolean
  /** For relationship-based selects */
  relationship?: RelationshipExtension
  /** For dynamic items using iterable pattern */
  iterable?: string
  /** Template for each item in the iterable */
  itemTemplate?: {
    value: string
    label: string
  }
}

/**
 * Combobox component definition.
 */
export interface ComboboxComponent extends FormStyleProps {
  component: 'combobox'
  label?: string
  placeholder?: string
  helpText?: string
  items?: FieldOption[]
  value?: string
  /** For relationship-based comboboxes */
  relationship?: RelationshipExtension
}

/**
 * Checkbox component definition.
 */
export interface CheckboxComponent extends FormStyleProps {
  component: 'checkbox'
  label?: string
  helpText?: string
  checked?: boolean
  disabled?: boolean
}

/**
 * DatePicker component definition.
 */
export interface DatePickerComponent extends FormStyleProps {
  component: 'datepicker'
  label?: string
  helpText?: string
  value?: string | Date
  disabled?: boolean
}

/**
 * TimePicker component definition.
 */
export interface TimePickerComponent extends FormStyleProps {
  component: 'timepicker'
  label?: string
  helpText?: string
  value?: string
  disabled?: boolean
}

/**
 * Status indicator values.
 */
export type StatusIndicator = 'success' | 'pending' | 'error' | 'warning'

/**
 * FieldSetting component definition (button that can open modal).
 */
export interface FieldSettingComponent extends FormStyleProps {
  component: 'fieldsetting'
  label: string
  description?: string
  helpText?: string
  mode?: 'field' | 'setting'
  /** Status indicator - can be Liquid template */
  status?: StatusIndicator | string
  /** Text to display alongside status badge - can be Liquid template */
  statusText?: string
  button: ButtonProps
  /** Nested modal form */
  modalForm?: ModalFormDefinition
}

/**
 * ImageSetting component definition.
 */
export interface ImageSettingComponent extends FormStyleProps {
  component: 'imagesetting'
  label?: string
  description?: string
  helpText?: string
  accept?: string
}

/**
 * FileSetting component definition.
 */
export interface FileSettingComponent extends FormStyleProps {
  component: 'filesetting'
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

/**
 * Item template for list rendering.
 */
export interface ListItemTemplate {
  component: string
  span?: number
  mdSpan?: number
  lgSpan?: number
  props: Record<string, unknown>
}

/**
 * List component definition.
 */
export interface ListComponent extends FormStyleProps {
  component: 'list'
  title?: string
  items?: Array<{ id: string; label: string; description?: string }>
  emptyMessage?: string
  /** Model to fetch list items from */
  model?: string
  labelField?: string
  descriptionField?: string
  icon?: string
  /** Context variable name to iterate over */
  iterable?: string
  /** Template for each item */
  itemTemplate?: ListItemTemplate
}

/**
 * EmptyForm component definition.
 */
export interface EmptyFormComponent extends FormStyleProps {
  component: 'emptyform'
  title?: string
  description?: string
  icon?: string
}

/**
 * Alert component definition.
 */
export interface AlertComponent extends FormStyleProps {
  component: 'alert'
  title: string
  description: string
  icon?: string
  variant?: 'default' | 'destructive'
}

/**
 * Union of all form component definitions.
 */
export type FormComponent =
  | InputComponent
  | TextareaComponent
  | SelectComponent
  | ComboboxComponent
  | CheckboxComponent
  | DatePickerComponent
  | TimePickerComponent
  | FieldSettingComponent
  | ImageSettingComponent
  | FileSettingComponent
  | ListComponent
  | EmptyFormComponent
  | AlertComponent

/**
 * Layout column definition.
 */
export interface FormLayoutColumn {
  field: string
  colSpan: number
  dataType?: string
  subQuery?: unknown
}

/**
 * Layout row definition.
 */
export interface FormLayoutRow {
  columns: FormLayoutColumn[]
}

/**
 * Form layout configuration.
 */
export interface FormLayoutConfig {
  type: 'form'
  rows: FormLayoutRow[]
}

/**
 * Form props definition.
 */
export interface FormProps {
  id?: string
  fields: FormComponent[]
  layout: FormLayoutConfig
  /** Actions that trigger tool calls */
  actions?: ActionDefinition[]
}

/**
 * Card block header definition.
 */
export interface CardHeader {
  title: string
  description?: string
  descriptionHref?: string
}

/**
 * Card block definition.
 */
export interface CardBlock {
  type: 'card'
  /** Disable drag-and-drop in the form */
  restructurable?: boolean
  header?: CardHeader
  form: FormProps
  actions?: ActionDefinition[]
  secondaryActions?: ActionDefinition[]
  primaryActions?: ActionDefinition[]
}

/**
 * List block definition.
 */
export interface ListBlock {
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

/**
 * Model mapper block definition - for mapping SHARED models to workspace models.
 */
export interface ModelMapperBlock {
  type: 'model_mapper'
  /** The SHARED model handle from provision config */
  model: string
}

/**
 * Union of all block types.
 */
export type BlockDefinition = CardBlock | ListBlock | ModelMapperBlock
