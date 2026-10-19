import { z } from 'zod';

/** UUID string validation for :id route params. */
export const uuidIdSchema = z.string().uuid('Invalid id');

/**
 * Required, trimmed text. Null / empty / whitespace-only strings are treated
 * as "missing" so the required error surfaces instead of an empty value
 * slipping through.
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

/**
 * Coerces JSON/query values to finite numbers, normalizing null and blank
 * strings to "missing" so defaults / required errors apply. Only strings and
 * real numbers coerce — booleans (Number(true) === 1), arrays and objects
 * become NaN so `z.number()` rejects them with a clean "must be a number"
 * instead of silently storing a coerced value.
 */
function numberFrom(label: string) {
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
      .finite(`${label} must be a finite number`),
  );
}

/** Subject units: required, > 0 (database-specification.md check constraint). */
export const subjectUnitsSchema = numberFrom('Units')
  .refine((n) => n > 0, 'Units must be greater than 0')
  .refine((n) => n <= 99, 'Units must be 99 or less');

/** Weekly hours: optional (defaults to 0), >= 0. */
function hoursField(label: string) {
  return numberFrom(label)
    .refine((n) => n >= 0, `${label} cannot be negative`)
    .refine((n) => n <= 99, `${label} must be 99 or less`)
    .default(0);
}

/**
 * Single-meeting scheduling caps (Schedule page rule): one LECTURE block is
 * at most 2h, one LAB block at most 3h. Subjects carrying more than that in
 * one session type are placed as multiple blocks, so cap the catalog here —
 * not just the picker — to keep data entry consistent with the grid.
 */
function lectureField() {
  return hoursField('Lecture hours').refine(
    (n) => n <= 2,
    'Lecture hours cannot exceed 2 (one lecture block is at most 2h)',
  );
}

function labField() {
  return hoursField('Lab hours').refine(
    (n) => n <= 3,
    'Lab hours cannot exceed 3 (one lab block is at most 3h)',
  );
}

export const createSubjectSchema = z
  .object({
    code: presentString('Subject code', 40),
    title: presentString('Title', 255),
    units: subjectUnitsSchema,
    lecture_hours: lectureField(),
    lab_hours: labField(),
  })
  .strict();

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;

export const updateSubjectSchema = createSubjectSchema
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;

/** GET /api/subjects query params: pagination + search + sort. */
export const subjectQuerySchema = z.object({
  search: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(100, 'Search must be at most 100 characters').optional(),
  ),
  page: z.coerce
    .number({ invalid_type_error: 'Page must be a number' })
    .int('Page must be an integer')
    .min(1, 'Page must be at least 1')
    .default(1),
  pageSize: z.coerce
    .number({ invalid_type_error: 'Page size must be a number' })
    .int('Page size must be an integer')
    .min(1, 'Page size must be at least 1')
    .max(100, 'Page size must be at most 100')
    .default(10),
  sortBy: z.enum(['code', 'title', 'units', 'created_at']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

export type SubjectQueryInput = z.infer<typeof subjectQuerySchema>;