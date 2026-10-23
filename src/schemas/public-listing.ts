import { z } from 'zod/v4'

/**
 * Copy written for a public website.
 * This is not an operating prompt, persona, or skill instructions.
 */
export const PublicListingSchema = z.object({
  summary: z.string().optional(),
  details: z.string().optional(),
})

export type PublicListing = z.infer<typeof PublicListingSchema>
