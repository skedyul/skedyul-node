/**
 * App report definitions.
 *
 * A report names entities and entity fields. The workplace CRM map turns those
 * into models and columns when the report runs. Variants live on the report.
 * They are not rows, and they are not YAML.
 */

/** One column of a matrix variant. `match` is the order of entity match values. */
export interface AppReportColumn {
  /** Shown as the column heading. Blank is a valid paper column. */
  label?: string
  /** Ordered match values, such as test codes, that belong in this column. */
  match: string[]
}

/** Columns for one group value, such as a discipline. */
export interface AppReportVariantGroup {
  /** Value of the matrix group field this layout applies to. */
  group: string
  columns: AppReportColumn[]
}

/**
 * A layout selected by the subject field's value.
 * The fallback variant is used when the value is empty or matches no key.
 */
export interface AppReportVariant {
  /** Subject field value, such as a panel code. Omitted on the fallback. */
  key?: string
  fallback?: boolean
  groups: AppReportVariantGroup[]
}

export interface AppReportFieldColumn {
  /** Entity field handle. */
  field: string
  label: string
}

/** A relationship walk from the subject, named with entity handles. */
export interface AppReportRelation {
  relationship: string
  entity: string
  fields?: string[]
  relations?: AppReportRelation[]
}

export interface AppReportHeaderSection {
  kind: 'header'
  handle: string
  title?: string
  /** Entity field on the subject used as the title. */
  titleField?: string
  subtitleField?: string
  fields?: string[]
  relations?: AppReportRelation[]
}

export interface AppReportMatrixSection {
  kind: 'matrix'
  handle: string
  title?: string
  /** Child entity whose rows fill the matrix. */
  entity: string
  /** Relationship on that entity back to the subject. */
  relationship: string
  matchField: string
  groupField?: string
  rowField: string
  valueField: string
  lowField?: string
  highField?: string
  statusField?: string
  statusFallbackField?: string
  numericField?: string
  numericLowField?: string
  numericHighField?: string
  commentField?: string
}

/** Notes stored on a JSON field of the subject. */
export interface AppReportNotesSection {
  kind: 'notes'
  handle: string
  title?: string
  field: string
  groupKey?: string
  titleKey: string
  bodyKey: string
}

export interface AppReportTableVia {
  entity: string
  /** Relationship on the table entity pointing at this parent. */
  relationship: string
  /** Relationship on the parent pointing at the report subject. */
  parentRelationship: string
  columns?: AppReportFieldColumn[]
}

export interface AppReportTableSection {
  kind: 'table'
  handle: string
  title?: string
  entity: string
  relationship: string
  columns: AppReportFieldColumn[]
  via?: AppReportTableVia
}

/**
 * Columns come from related orders, not from a fixed variant.
 * Rows are the match values that were abnormal at least once.
 */
export interface AppReportTimelineSection {
  kind: 'timeline'
  handle: string
  title?: string
  entity: string
  relationship: string
  matchField: string
  groupField?: string
  rowField: string
  valueField: string
  lowField?: string
  highField?: string
  statusField?: string
  statusFallbackField?: string
  numericField?: string
  numericLowField?: string
  numericHighField?: string
  /** Status values that keep an analyte on the timeline. */
  abnormal?: string[]
  order: {
    /** Relationship on the subject pointing at the order. */
    relationship: string
    entity: string
    /** Relationship on the order pointing at the patient. */
    patientRelationship: string
    dateField: string
    dateFallbackField?: string
    labelField?: string
    limit?: number
  }
}

export type AppReportSection =
  | AppReportHeaderSection
  | AppReportMatrixSection
  | AppReportNotesSection
  | AppReportTableSection
  | AppReportTimelineSection

export interface AppReportSubject {
  entity: string
  /** Entity field whose value selects a variant. */
  variantField?: string
}

export interface AppReportDefinition {
  handle: string
  label: string
  /**
   * App whose CRM map resolves the entity handles.
   * Set on a workplace-owned report. An app-shipped report uses the install.
   */
  appHandle?: string
  subject: AppReportSubject
  sections: AppReportSection[]
  variants?: AppReportVariant[]
}
