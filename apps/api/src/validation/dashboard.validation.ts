import { z } from 'zod';

/**
 * GET /api/dashboard/summary filters — `termId` is optional:
 * omitted / blank means the active term (falling back to all terms when no
 * term is active yet). A provided value must be a UUID (clean 400 otherwise),
 * matching the schedule-view query contract.
 */
export const dashboardSummaryQuerySchema = z.object({
  termId: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .string({ invalid_type_error: 'Term must be a UUID' })
      .uuid('Term must be a UUID')
      .optional(),
  ),
});

export type DashboardSummaryQueryInput = z.infer<typeof dashboardSummaryQuerySchema>;
