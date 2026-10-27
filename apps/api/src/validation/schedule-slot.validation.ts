import { z } from 'zod';
import { TIME_OF_DAY_PATTERN, timeOfDayToMinutes } from '../utils/time.js';

/** Shared UUID param validation (same contract as subject.validation.ts). */
export { uuidIdSchema } from './subject.validation.js';

/** Grid filters are identical to the workload-assignment filters — reuse. */
export { workloadAssignmentQuerySchema as scheduleSlotQuerySchema } from './workload-assignment.validation.js';

const uuidField = (label: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be a UUID` })
      .uuid(`${label} must be a UUID`),
  );

/** Optional room: `null` / `""` / omitted all mean "TBA" (room_id is nullable).
 *  Explicit null (not undefined) so a move can clear a room back to TBA. */
const optionalRoomId = z.preprocess(
  (value) => (value === '' ? null : value),
  z
    .string({ invalid_type_error: 'Room must be a UUID' })
    .uuid('Room must be a UUID')
    .nullable()
    .optional(),
);

/** Schedule block split: lecture vs lab. A subject may require both kinds of
 *  hours, and the workweek builds from whichever chunk the Chair drags. */

/** 24-hour "HH:MM" (seconds optional). */
const timeOfDaySchema = (label: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
      .trim()
      .regex(TIME_OF_DAY_PATTERN, `${label} must look like 07:30 (24-hour)`),
  );

/** Only the two session kinds the grid tracks. */
const sessionTypeSchema = z.enum(['LECTURE', 'LAB'], {
  errorMap: () => ({ message: 'session_type must be LECTURE or LAB' }),
});

export const dayOfWeekSchema = z.preprocess(
  (value) => (value === undefined || value === null || value === '' ? undefined : value),
  z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], {
    errorMap: () => ({ message: 'Day must be MON, TUE, WED, THU, FRI or SAT' }),
  }),
);

/** database-specification.md: `end_time > start_time`. */
function assertTimeRange(data: { start_time: string; end_time: string }, ctx: z.RefinementCtx): void {
  if (timeOfDayToMinutes(data.end_time) <= timeOfDayToMinutes(data.start_time)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['end_time'],
      message: 'End time must be after start time',
    });
  }
}

export const createScheduleSlotSchema = z
  .object({
    workload_assignment_id: uuidField('Workload assignment'),
    room_id: optionalRoomId,
    session_type: sessionTypeSchema,
    day_of_week: dayOfWeekSchema,
    start_time: timeOfDaySchema('Start time'),
    end_time: timeOfDaySchema('End time'),
  })
  .strict()
  .superRefine(assertTimeRange);

export type CreateScheduleSlotInput = z.infer<typeof createScheduleSlotSchema>;

/** PATCH for moving/resizing a placed block. When only one of the times is
 *  supplied the service merges it with the stored slot and re-checks the range. */
export const updateScheduleSlotSchema = z
  .object({
    room_id: optionalRoomId,
    session_type: sessionTypeSchema.optional(),
    day_of_week: dayOfWeekSchema.optional(),
    start_time: timeOfDaySchema('Start time').optional(),
    end_time: timeOfDaySchema('End time').optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  })
  .superRefine((data, ctx) => {
    if (data.start_time !== undefined && data.end_time !== undefined) {
      assertTimeRange({ start_time: data.start_time, end_time: data.end_time }, ctx);
    }
  });

export type UpdateScheduleSlotInput = z.infer<typeof updateScheduleSlotSchema>;

/**
 * Body for POST /api/schedule-slots/:id/confirm-override — the same placement
 * payload plus an optional `slot_id` for the "move despite the conflict" case.
 * `override_reason` is optional free text that lands in the audit log line.
 */
export const confirmOverrideSchema = z
  .object({
    workload_assignment_id: uuidField('Workload assignment').optional(),
    slot_id: uuidField('Slot').optional(),
    room_id: optionalRoomId,
    session_type: sessionTypeSchema.optional(),
    day_of_week: dayOfWeekSchema,
    start_time: timeOfDaySchema('Start time'),
    end_time: timeOfDaySchema('End time'),
    override_reason: z
      .preprocess(
        (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
        z.string().trim().max(300, 'Reason must be at most 300 characters').optional(),
      ),
  })
  .strict()
  .superRefine(assertTimeRange);

export type ConfirmOverrideInput = z.infer<typeof confirmOverrideSchema>;

/**
 * POST /api/schedule-slots/reset — Chair/Admin bulk clear of placed class
 * blocks for the active term. Scoped by exactly one of: all (whole term),
 * one faculty member, or one room. The caller's account password must be
 * supplied so a stray click (or an unattended Chair session) cannot wipe
 * the grid — the server re-verifies it against the stored hash.
 *
 * Placed ScheduleSlot rows are hard-deleted; workload assignments are kept
 * so everything returns to the "Unassigned classes" panel.
 */
const optionalScopeUuid = (label: string) =>
  z.preprocess(
    (value) => (value === undefined || value === null || value === '' ? undefined : value),
    z.string().uuid(`${label} must be a UUID`).optional(),
  );

export const resetScheduleSchema = z
  .object({
    term_id: uuidField('Term'),
    faculty_id: optionalScopeUuid('faculty_id'),
    room_id: optionalScopeUuid('room_id'),
    password: z.string().min(1, 'Enter your account password to confirm'),
  })
  .strict()
  .refine((data) => !(data.faculty_id && data.room_id), {
    message: 'Reset one scope at a time: all, one faculty, or one room',
    path: ['room_id'],
  });

export type ResetScheduleInput = z.infer<typeof resetScheduleSchema>;