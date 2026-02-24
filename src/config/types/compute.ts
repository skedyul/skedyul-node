/**
 * Compute layer types.
 *
 * Re-exports ComputeLayer from base for backwards compatibility.
 */

import type { ComputeLayer } from './base'

export type { ComputeLayer }

// Type aliases for specific compute layers (for type narrowing)
export type Serverless = 'serverless'
export type Dedicated = 'dedicated'
