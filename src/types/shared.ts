// ─────────────────────────────────────────────────────────────────────────────
// Shared Types
// ─────────────────────────────────────────────────────────────────────────────

/** App info - always present in all contexts */
export interface AppInfo {
  id: string
  versionId: string
}

/** Workplace info - present in runtime contexts */
export interface WorkplaceInfo {
  id: string
  subdomain: string
}

/** Request info - present in runtime contexts */
export interface RequestInfo {
  url: string
  params: Record<string, string>
  query: Record<string, string>
}
