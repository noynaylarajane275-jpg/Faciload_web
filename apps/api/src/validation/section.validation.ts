import { z } from 'zod';

/** Shared UUID param validation (same contract as subject.validation.ts). */
export { uuidIdSchema } from './subject.validation.js';

/**
 * Required, trimmed text — blank strings are treated as missing so the
 * "required" message surfaces (mirrors subject.validation.ts presentString).
 */
function presentString(label: string, max: number) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
      .trim()
      .min(1, `${label} is required`)
      .max(max, `${label} must be at most ${max} characters`),
  );
}

/** Coerces JSON/query values to finite numbers, then applies the whole-number
 *  range checks inside the same preprocess wrapper (a bare `numberFrom`
 *  returns a ZodEffects, which has no `.int()`/`.min()` chain). */
function integerFrom(label: string, min: number, max: number) {
  return z.preprocess(
    (value) => {
      if (value === null || value === undefined) {
        return undefined;
      }
      if (typeof value === 'string' && value.trim() === '') {
        return undefined;
      }
      if (typeof value === 'string') {
        return Number(value);
      }
      if (typeof value === 'number') {
        return value;
      }
      return Number.NaN;
    },
    z
      .number({ invalid_type_error: `${label} must be a number` })
      .finite(`${label} must be a finite number`)
      .int(`${label} must be a whole number`)
      .min(min, `${label} must be at least ${min}`)
      .max(max, `${label} must be at most ${max}`),
  );
}

/**
 * Year level 1–6 covers the standard five-year IE curriculum plus a margin
 * (the column is a plain int in the DB; this range is the app-level guard).
 */
export const yearLevelSchema = integerFrom('Year level', 1, 6);

export const createSectionSchema = z
  .object({
    year_level: yearLevelSchema,
    name: presentString('Section name', 60),
  })
  .strict();

export type CreateSectionInput = z.infer<typeof createSectionSchema>;

export const updateSectionSchema = z
  .object({
    year_level: yearLevelSchema.optional(),
    name: presentString('Section name', 60).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;

/** GET /api/sections query params — small reference list, so no pagination. */
export const sectionQuerySchema = z.object({
  search: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(100, 'Search must be at most 100 characters').optional(),
  ),
  year_level: z.preprocess(
    (value) => (value === undefined || value === null || value === '' ? undefined : value),
    yearLevelSchema.optional(),
  ),
});

export type SectionQueryInput = z.infer<typeof sectionQuerySchema>;