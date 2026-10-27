import { z } from 'zod';
import { TIME_OF_DAY_PATTERN, timeOfDayToMinutes } from '../utils/time.js';
import { uuidIdSchema } from './subject.validation.js';

export const otherFunctionTypeSchema = z.enum(
  ['RESEARCH', 'EXTENSION', 'IMP', 'CONSULTATION'],
  { errorMap: () => ({ message: 'Choose Research, Extension, IMP or Consultation' }) },
);

const classProgramDaySchema = z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI']);

const timeSchema = (label: string) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .regex(TIME_OF_DAY_PATTERN, `${label} must look like 07:30 (24-hour)`);

export const otherFunctionSessionQuerySchema = z.object({
  termId: uuidIdSchema,
  facultyId: uuidIdSchema.optional(),
});

export const createOtherFunctionSessionSchema = z
  .object({
    term_id: uuidIdSchema,
    function_type: otherFunctionTypeSchema,
    title: z.string().trim().max(120, 'Title must be 120 characters or fewer').optional(),
    day_of_week: classProgramDaySchema,
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
    if (end - start < 60) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['end_time'],
        message: 'A session must be at least one hour',
      });
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

export type CreateOtherFunctionSessionInput = z.infer<
  typeof createOtherFunctionSessionSchema
>;
