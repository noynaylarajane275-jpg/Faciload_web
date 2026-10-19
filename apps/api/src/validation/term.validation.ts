import { z } from 'zod';

/** Shared UUID param validation (same contract as subject.validation.ts). */
export { uuidIdSchema } from './subject.validation.js';

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

function booleanFrom(label: string) {
  return z.preprocess((value) => {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string' && (value === 'true' || value === 'false')) {
      return value === 'true';
    }
    return value;
  }, z.boolean({ invalid_type_error: `${label} must be true or false` }));
}

/** "YYYY-YYYY" school year, e.g. 2026-2027. */
export const schoolYearSchema = presentString('School year', 20).refine(
  (value) => /^\d{4}-\d{4}$/.test(value),
  'School year must look like 2026-2027',
);

/** Mirrors the schema's `semester` string field (same pattern as
 *  faculty.validation.ts); z.enum replaces the dropped Prisma enum. */
export const semesterSchema = z.preprocess(
  (value) => (value === undefined || value === null || value === '' ? undefined : value),
  z.enum(['FIRST', 'SECOND', 'SUMMER'], {
    errorMap: () => ({ message: 'Semester must be FIRST, SECOND or SUMMER' }),
  }),
);

export const createTermSchema = z
  .object({
    school_year: schoolYearSchema,
    semester: semesterSchema,
    is_active: booleanFrom('Active flag').default(false),
  })
  .strict();

export type CreateTermInput = z.infer<typeof createTermSchema>;

export const updateTermSchema = z
  .object({
    school_year: schoolYearSchema.optional(),
    semester: semesterSchema.optional(),
    is_active: booleanFrom('Active flag').optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

export type UpdateTermInput = z.infer<typeof updateTermSchema>;