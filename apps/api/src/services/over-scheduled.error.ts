import { ApiError } from '../errors/apiError.js';

export function overScheduledError(
  subjectCode: string,
  sessionType: 'LECTURE' | 'LAB',
  placedHours: number,
  requestedHours: number,
  limitHours: number,
): ApiError {
  return ApiError.badRequest(
    `${subjectCode} would schedule ${
      requestedHours
    } ${sessionType.toLowerCase()} hour${requestedHours === 1 ? '' : 's'} ` +
      `for a subject with only ${limitHours} ${sessionType.toLowerCase()} hour${limitHours === 1 ? '' : 's'} ` +
      `(already placed: ${placedHours} hour${placedHours === 1 ? '' : 's'}). ` +
      `Reduce the duration or pick a different ${sessionType.toLowerCase()} block.`,
    {
      code: 'SESSION_HOURS_OVER_CAPACITY',
      field: 'session_type',
      subject_code: subjectCode,
      session_type: sessionType,
      /** Hours already placed for this assignment + session type. */
      placed_hours: placedHours,
      requested_hours: requestedHours,
      limit_hours: limitHours,
    },
  );
}