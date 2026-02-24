/**
 * Navigation definition types.
 *
 * Navigation defines the sidebar, breadcrumbs, and other
 * navigational elements for app pages.
 */

/**
 * Navigation item for sidebar.
 */
export interface NavigationItem {
  /** Display label (supports Liquid templates) */
  label: string
  /** URL href (supports Liquid templates with path_params and context) */
  href: string
  /** Optional Lucide icon name */
  icon?: string
}

/**
 * Navigation section with title and items.
 */
export interface NavigationSection {
  /** Section title (supports Liquid templates) */
  title?: string
  /** Navigation items in this section */
  items: NavigationItem[]
}

/**
 * Sidebar navigation configuration.
 */
export interface NavigationSidebar {
  /** Sections to display in the sidebar */
  sections: NavigationSection[]
}

/**
 * Breadcrumb item.
 */
export interface BreadcrumbItem {
  /** Display label (supports Liquid templates) */
  label: string
  /** Optional href - if not provided, item is not clickable */
  href?: string
}

/**
 * Breadcrumb navigation configuration.
 */
export interface NavigationBreadcrumb {
  /** Breadcrumb items from left to right */
  items: BreadcrumbItem[]
}

/**
 * Full navigation configuration.
 */
export interface NavigationConfig {
  /** Sidebar navigation */
  sidebar?: NavigationSidebar
  /** Breadcrumb navigation */
  breadcrumb?: NavigationBreadcrumb
}
