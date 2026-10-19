import { z } from 'zod';

/** Shared UUID param validation (same contract as subject.validation.ts). */
export { uuidIdSchema } from './subject.validation.js';

const uuidField = (label: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string({ required_error: `${label} is required`, invalid_type_error: `${label} must be a UUID` }).uuid(`${label} must be a UUID`),
  );

export const createWorkloadAssignmentSchema = z
  .object({
    faculty_id: uuidField('Faculty'),
    subject_id: uuidField('Subject'),
    section_id: uuidField('Section'),
    term_id: uuidField('Term'),
  })
  .strict();

export type CreateWorkloadAssignmentInput = z.infer<typeof createWorkloadAssignmentSchema>;

/** GET /api/workload-assignments filters — all optional. */
const optionalUuid = (label: string) =>
  z.preprocess(
    (value) => (value === undefined || value === null || value === '' ? undefined : value),
    z.string().uuid(`${label} must be a UUID`).optional(),
  );

export const workloadAssignmentQuerySchema = z.object({
  termId: optionalUuid('termId'),
  facultyId: optionalUuid('facultyId'),
  sectionId: optionalUuid('sectionId'),
  subjectId: optionalUuid('subjectId'),
  search: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(100, 'Search must be at most 100 characters').optional(),
  ),
  page: z.coerce
    .number({ invalid_type_error: 'Page must be a number' })
    .int('Page must be an integer')
    .min(1, 'Page must be at least 1')
    .optional(),
  pageSize: z.coerce
    .number({ invalid_type_error: 'Page size must be a number' })
    .int('Page size must be an integer')
    .min(1, 'Page size must be at least 1')
    .max(200, 'Page size must be at most 200')
    .optional(),
});

export type WorkloadAssignmentQueryInput = z.infer<typeof workloadAssignmentQuerySchema>;

/** PATCH /api/workload-assignments/:id — Chair may re-point subject/section
 *  (not faculty/term, to avoid identity drift; use delete + recreate for a
 *  faculty change) and recolor the card. */
const colorField = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'color must be a hex color like #2FBF71')
    .nullable()
    .optional(),
);

export const updateWorkloadAssignmentSchema = z
  .object({
    subject_id: optionalUuid('subject_id'),
    section_id: optionalUuid('section_id'),
    color: colorField,
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

export type UpdateWorkloadAssignmentInput = z.infer<typeof updateWorkloadAssignmentSchema>;