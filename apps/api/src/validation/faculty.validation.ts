import { z } from 'zod';
import { uuidIdSchema } from './subject.validation.js';

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

/** Optional, trimmed text; '' normalizes to null (rank is optional per spec). */
function optionalText(label: string, max: number) {
  return z.preprocess(
    (value) => {
      if (value === null) {
        return null;
      }
      if (typeof value === 'string' && value.trim() === '') {
        return null;
      }
      return value;
    },
    z
      .string({ invalid_type_error: `${label} must be text` })
      .trim()
      .max(max, `${label} must be at most ${max} characters`)
      .nullable()
      .optional(),
  );
}

/** Integer via z.int()/Number.isInteger — 24.5 must fail, 0 must fail. */
function intFrom(label: string) {
  return z.preprocess(
    (value) => (value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value),
    z.coerce
      .number({ invalid_type_error: `${label} must be a number` })
      .refine(Number.isInteger, `${label} must be a whole number`),
  );
}

/** Faculty.max_units: required on create, int > 0 (DB check constraint). */
export const maxUnitsSchema = intFrom('Max units')
  .refine((n) => n > 0, 'Max units must be greater than 0')
  .refine((n) => n <= 99, 'Max units must be 99 or less');

/** Employment status (see createFacultySchema). */
export const employmentStatusSchema = z.preprocess(
  (value) => (value === undefined || value === null || value === '' ? undefined : value),
  z.enum(['FULL_TIME', 'PART_TIME'], {
    errorMap: () => ({ message: 'Employment status must be FULL_TIME or PART_TIME' }),
  }),
);

/**
 * Optional login-account block for faculty creation. When present the API
 * provisions a linked User (role FACULTY) so the new faculty can sign in and
 * see their own schedule/workload. Mirrors the email/password rules in
 * user.validation.ts (valid email, password >= 8 chars). Absent = no account
 * (the historical default, kept so `user` stays null).
 *
 * `existing_user_id` is the alternative: link an already-registered (unlinked)
 * User instead of creating a new one. Exactly one of `account` /
 * `existing_user_id` may be provided.
 */
export const facultyAccountSchema = z
  .object({
    email: z
      .string({ required_error: 'Account email is required' })
      .trim()
      .toLowerCase()
      .email('Enter a valid email address')
      .max(200, 'Email must be at most 200 characters'),
    password: z
      .string({ required_error: 'Account password is required' })
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be at most 128 characters'),
  })
  .strict();

export const facultyExistingUserSchema = z.object({
  existing_user_id: uuidIdSchema,
});

export const createFacultySchema = z
  .object({
    employee_no: presentString('Employee no', 40),
    first_name: presentString('First name', 120),
    last_name: presentString('Last name', 120),
    rank: optionalText('Rank', 120),
    employment_status: employmentStatusSchema.default('FULL_TIME'),
    max_units: maxUnitsSchema.default(24),
    // Opt-in: Chair may create a login for the faculty in the same call…
    account: facultyAccountSchema.optional(),
    // …or link an already-registered (unlinked) user account instead.
    existing_user_id: uuidIdSchema.optional(),
  })
  .strict()
  .refine((data) => !(data.account !== undefined && data.existing_user_id !== undefined), {
    message: 'Provide either a new account or an existing user to link, not both',
    path: ['existing_user_id'],
  });

export type CreateFacultyInput = z.infer<typeof createFacultySchema>;

// Updates never provision a login - strip `account`/`existing_user_id` so they
// can't slip in via PATCH (linking an existing user has its own endpoint).
export const updateFacultySchema = z
  .object({
    employee_no: presentString('Employee no', 40),
    first_name: presentString('First name', 120),
    last_name: presentString('Last name', 120),
    rank: optionalText('Rank', 120),
    employment_status: employmentStatusSchema,
    max_units: maxUnitsSchema,
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

export type UpdateFacultyInput = z.infer<typeof updateFacultySchema>;

export const facultyQuerySchema = z.object({
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
  sortBy: z.enum(['employee_no', 'last_name', 'max_units', 'created_at']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

export type FacultyQueryInput = z.infer<typeof facultyQuerySchema>;