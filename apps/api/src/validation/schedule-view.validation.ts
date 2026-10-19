import { z } from 'zod';

/** Shared UUID param validation (same contract as subject.validation.ts). */
export { uuidIdSchema } from './subject.validation.js';

/**
 * `?termId=` is optional on every schedule view: omitted / blank means "all
 * terms" (the raw schedule across terms), while a provided value must be a
 * UUID or the request is a clean 400.
 */
export const scheduleViewQuerySchema = z.object({
  termId: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .string({ invalid_type_error: 'Term must be a UUID' })
      .uuid('Term must be a UUID')
      .optional(),
  ),
});

export type ScheduleViewQueryInput = z.infer<typeof scheduleViewQuerySchema>;
