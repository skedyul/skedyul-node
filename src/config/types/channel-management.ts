/**
 * Channel management: what the platform's Communication settings show for a
 * channel, declared by the app as plain data (`ChannelDefinition.management`).
 *
 * The app declares setup sections, extra channel tabs and an add flow. Its
 * tools do the work (buy a number, connect a Page, submit compliance) and
 * write the resulting state to the platform; the platform renders that state
 * generically. Nothing in the platform names an app or vendor.
 *
 * Without `management`, a channel still appears in Communication settings
 * with the platform's own pages (messaging rules, rename, routing, archive).
 */

/** Visual tone of a status badge. */
export type ChannelManagementTone =
  | 'success'
  | 'pending'
  | 'warning'
  | 'danger'
  | 'neutral'

/** Maps a status value an app writes on a row to a badge. */
export type ChannelStatusMap = Record<
  string,
  { label: string; tone: ChannelManagementTone }
>

/** When an action applies, by the row's status value. */
export interface ChannelStatusCondition {
  status?: string[]
  notStatus?: string[]
}

/**
 * A button. The platform invokes `tool` on the app with the context of where
 * it was clicked (item, channel, form values), then re-reads the state.
 * Give `tool` or `href` (a purchase section's `select` may have neither).
 */
export interface ChannelActionDefinition {
  handle: string
  label: string
  /** Lucide icon name */
  icon?: string
  variant?: 'default' | 'outline' | 'ghost' | 'destructive'
  /** App tool to invoke. */
  tool?: string
  /** Or a link. */
  href?: string
  /** Ask before running. */
  confirm?: { title: string; body: string; confirmLabel?: string }
  /**
   * Collect input first, in a dialog. The values reach `tool` by field key,
   * beside where it was clicked. On a `requirements` item, fields start from
   * the values its requirement row's `data` holds (to fix and resubmit).
   */
  form?: ChannelActionFormDefinition
  /** Only show for rows in these statuses. */
  when?: ChannelStatusCondition
  /** Show disabled, with a reason, for rows in these statuses. */
  disabledWhen?: { status: string[]; reason: string }
}

/** The dialog an action opens to collect its tool's input. */
export interface ChannelActionFormDefinition {
  title: string
  description?: string
  fields: ChannelFormFieldDefinition[]
  /** Default: the action's label. */
  submitLabel?: string
}

interface ChannelSectionBase {
  /** Unique within the channel definition. State rows reference it. */
  handle: string
  title: string
  description?: string
  /** Lucide icon name */
  icon?: string
}

/** Requirement states, e.g. for compliance items. */
export type ChannelRequirementState =
  | 'not_started'
  | 'in_review'
  | 'approved'
  | 'rejected'

/**
 * An ordered checklist (e.g. regulatory compliance). The app writes one
 * requirement row per item, typically from a provider webhook.
 */
export interface ChannelRequirementsSectionDefinition extends ChannelSectionBase {
  kind: 'requirements'
  /** Context shown above the list, e.g. country and number type. */
  scope?: { label: string; value: string }[]
  /** What completing every item unlocks. */
  unlocks?: string
  items: Array<{
    handle: string
    title: string
    description?: string
    /** Values read from the row's `data` by key. */
    fields?: Array<{ key: string; label: string; copy?: boolean }>
    /** Action per state, e.g. `not_started` → "Add details". */
    actions?: Partial<Record<ChannelRequirementState, ChannelActionDefinition>>
  }>
}

/** An account connection (OAuth or similar). The app writes one connection row. */
export interface ChannelConnectionSectionDefinition extends ChannelSectionBase {
  kind: 'connection'
  /** Connection handle. Several channels of one app can share it. */
  connection: string
  /** Permissions the connection needs, shown with what each is for. */
  permissions?: Array<{ key: string; description?: string; requiredFor?: string }>
  /** Shown before anything is connected. */
  emptyNote?: string
  connect: ChannelActionDefinition
  /** Label once connected, e.g. "Reconnect". Runs the same tool as `connect`. */
  reconnectLabel?: string
  disconnect?: ChannelActionDefinition
}

/** A list of things the app syncs (numbers, Pages, Slack channels). */
export interface ChannelResourcesSectionDefinition extends ChannelSectionBase {
  kind: 'resources'
  /** Resource handle. The app's resource rows carry it. */
  resource: string
  /** `channel`: only rows linked to the channel being viewed. Default `installation`. */
  scope?: 'installation' | 'channel'
  /** Singular noun for the column header and empty state. */
  noun: string
  /** Lucide icon name for each row. */
  itemIcon?: string
  /** Values read from the row's `data` by key. */
  columns?: Array<{ key: string; label: string; align?: 'left' | 'right' }>
  statuses: ChannelStatusMap
  filterByStatus?: boolean
  add?: ChannelActionDefinition
  /** Per-row actions. */
  actions?: ChannelActionDefinition[]
  empty?: { title: string; description?: string }
  footnote?: string
}

/** Key facts read from the channel's (or a connection's) `attributes`. */
export interface ChannelDetailsSectionDefinition extends ChannelSectionBase {
  kind: 'details'
  /** Read from a connection's attributes instead of the channel's. */
  source?: { connection: string }
  items: Array<{
    label: string
    /** Attribute key for the value. */
    key: string
    /** Attribute key whose value picks a badge from `badges`. */
    badgeKey?: string
    badges?: ChannelStatusMap
    help?: string
    /** Attribute key holding help text, when it depends on the value. */
    helpKey?: string
    /** Attribute keys for a 0–1 meter and its caption. */
    meter?: { valueKey: string; labelKey: string }
  }>
  action?: ChannelActionDefinition
}

/**
 * A field in a form section, an add-flow step or an action's form. Its
 * value reaches the tool under `key`.
 */
export type ChannelFormFieldDefinition = {
  /** Key in the channel's `settings`, the flow's values, or the tool's input. */
  key: string
  label: string
  help?: string
  /** The form can't be submitted while it is empty. */
  required?: boolean
} & (
  | {
      kind: 'text'
      default?: string
      placeholder?: string
      prefix?: string
      /** Input type, for validation and the right keyboard. Default `text`. */
      inputType?: 'text' | 'email' | 'tel' | 'url'
      /** Several lines. */
      multiline?: boolean
    }
  | { kind: 'toggle'; default?: boolean }
  | {
      /**
       * A file the person uploads. The tool receives its file id, which it
       * reads with `file.get` / `file.getUrl`.
       */
      kind: 'file'
      /** Accepted types, as for an input's `accept`, e.g. `application/pdf,image/*`. */
      accept?: string
    }
  | {
      kind: 'select' | 'radio'
      default?: string
      options: Array<{ value: string; label: string; description?: string }>
    }
)

/** A form over the channel's `settings`. `submit.tool` saves it. */
export interface ChannelFormSectionDefinition extends ChannelSectionBase {
  kind: 'form'
  fields: ChannelFormFieldDefinition[]
  /** Show a field (by key) only when another field equals a value. */
  showWhen?: Record<string, { field: string; equals: string | boolean }>
  submit?: ChannelActionDefinition
}

/** A filter on a purchase section. */
export type ChannelPurchaseFilterDefinition =
  | {
      kind: 'select'
      key: string
      label: string
      default: string
      options: Array<{ value: string; label: string }>
    }
  | { kind: 'text'; key: string; label: string; default?: string; placeholder?: string }
  | {
      kind: 'multi'
      key: string
      label: string
      options: Array<{ value: string; label: string; default?: boolean }>
    }

/** Search and pick something priced (e.g. a phone number). */
export interface ChannelPurchaseSectionDefinition extends ChannelSectionBase {
  kind: 'purchase'
  filters: ChannelPurchaseFilterDefinition[]
  /** App tool: `{ filters }` → priced options. */
  searchTool: string
  /** Picking a result. Without `tool`, it only selects it; the step's `next` runs the tool. */
  select: ChannelActionDefinition
  footnote?: string
}

/**
 * Status of the workplace domains this app uses for one purpose. Domains are
 * a platform resource, verified once and shared by every app; this section
 * only shows their status.
 */
export interface ChannelDomainsSectionDefinition extends ChannelSectionBase {
  kind: 'domains'
  /** One of the app's `provision.domains` handles. */
  purpose: string
  /** Show only one domain, named by a channel attribute or a flow value. */
  domain?: { fromAttribute?: string; fromValue?: string }
}

export type ChannelSectionDefinition =
  | ChannelDomainsSectionDefinition
  | ChannelRequirementsSectionDefinition
  | ChannelConnectionSectionDefinition
  | ChannelResourcesSectionDefinition
  | ChannelDetailsSectionDefinition
  | ChannelFormSectionDefinition
  | ChannelPurchaseSectionDefinition

/** One step of the add flow. */
export interface ChannelAddStepDefinition {
  handle: string
  title: string
  description?: string
  sections: ChannelSectionDefinition[]
  /** Continue. `tool` receives the step's values and returns the step summary, or the new channels. */
  next: ChannelActionDefinition
  /** Shown, with "Save and finish later", while the step's sections are incomplete. */
  waiting?: { title: string; body: string }
}

/** `ChannelDefinition.management` */
export interface ChannelManagementDefinition {
  /** What one channel is called: number, Page, account, address. */
  noun: { one: string; many: string }
  /** Sort order among channel kinds. Lower comes first. */
  order?: number
  /**
   * A tool the platform runs when Communication settings opens for this
   * app, so state the app keeps elsewhere (its own models, the provider) is
   * reported through `channelSetup.*` before it's shown. It should report
   * everything it knows; it receives no input.
   */
  sync?: { tool: string }
  /** Extra line in the archive confirmation. */
  archiveNote?: string
  /** Feature chips. `attribute` names a channel attribute; a falsy value strikes the chip through. */
  features?: Array<{ key: string; label: string; icon?: string; attribute?: string }>
  /** Badges on the channel row, from a channel attribute. */
  badges?: Array<{ attribute: string; statuses: ChannelStatusMap }>
  /** Setup for this kind of channel (account connection, compliance, domains). */
  setup?: { description?: string; sections: ChannelSectionDefinition[] }
  /** Tabs on a channel's page, after the platform's own. */
  tabs?: Array<{
    handle: string
    label: string
    /** Lucide icon name */
    icon: string
    sections: ChannelSectionDefinition[]
  }>
  /** The flow for adding a channel (e.g. buy a number, connect a Page). */
  add?: {
    title: string
    /** Setup sections that must be complete first. */
    requires?: { sections: string[]; message: string }
    /** Empty when channels appear on their own once setup is done (e.g. a widget found on a site). */
    steps: ChannelAddStepDefinition[]
    done: { title: string; body: string }
  }
}

/**
 * Why an app needs a workplace domain (`provision.domains`), e.g. to send
 * email from it. The app writes the DNS records that purpose needs; the
 * platform checks them.
 */
export interface DomainPurposeDefinition {
  handle: string
  label: string
  description?: string
}
