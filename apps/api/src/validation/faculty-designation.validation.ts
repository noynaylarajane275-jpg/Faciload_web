import { z } from 'zod';
import { TIME_OF_DAY_PATTERN, timeOfDayToMinutes } from '../utils/time.js';
import { uuidIdSchema } from './subject.validation.js';

const daySchema = z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI']);

const timeSchema = (label: string) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .regex(TIME_OF_DAY_PATTERN, `${label} must look like 07:30 (24-hour)`);

export const facultyDesignationQuerySchema = z.object({
  termId: uuidIdSchema,
  facultyId: uuidIdSchema.optional(),
});

export const createFacultyDesignationSchema = z
  .object({
    faculty_id: uuidIdSchema,
    term_id: uuidIdSchema,
    name: z.string().trim().min(1, 'Enter a designation name').max(120),
  })
  .strict();
export type CreateFacultyDesignationInput = z.infer<
  typeof createFacultyDesignationSchema
>;

export const createDesignationSessionSchema = z
  .object({
    designation_id: uuidIdSchema,
    title: z.string().trim().max(120).optional(),
    day_of_week: daySchema,
    start_time: timeSchema('Start time'),
    end_time: timeSchema('End time'),
  })
  .strict()
  .superRefine((session, ctx) => {
    const start = timeOfDayToMinutes(session.start_time);
    const end = timeOfDayToMinutes(session.end_time);
    if (end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['end_time'],
        message: 'End time must be after start time',
      });
      return;
    }
    if (start < 7 * 60 || end > 19 * 60) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['start_time'],
        message: 'Sessions must fit between 7:00 AM and 7:00 PM',
      });
    }
    if (start < 13 * 60 && end > 12 * 60) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['start_time'],
        message: 'Sessions cannot overlap the 12:00 PM–1:00 PM lunch break',
      });
    }
  });

export type CreateDesignationSessionInput = z.infer<
  typeof createDesignationSessionSchema
>;
