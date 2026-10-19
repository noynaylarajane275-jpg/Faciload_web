import type { ConflictCode, ConflictDetails } from '../../lib/schedule-slots';

/** The 409 codes the placement API returns and the UI's override flow understands. */
export const CONFLICT_CODES: ConflictCode[] = [
  'FACULTY_CONFLICT',
  'ROOM_CONFLICT',
  'ROOM_MAINTENANCE',
  'OVER_SCHEDULED_LECTURE_HOURS',
  'OVER_SCHEDULED_LAB_HOURS',
];

export const CONFLICT_LABELS: Record<ConflictCode, string> = {
  FACULTY_CONFLICT: 'Faculty conflict',
  ROOM_CONFLICT: 'Room conflict',
  ROOM_MAINTENANCE: 'Room under maintenance',
  OVER_SCHEDULED_LECTURE_HOURS: 'Lecture hours exceeded',
  OVER_SCHEDULED_LAB_HOURS: 'Lab hours exceeded',
};

export interface OverrideCandidate {
  code: ConflictCode;
  message: string;
  details: ConflictDetails | null;
}

/**
 * Classifies a placement error: a structured 409 (conflict/maintenance)
 * becomes an override candidate — the caller shakes the target cell and shows
 * the override dialog. Anything else (validation, network, 500) is not
 * overridable and stays a plain error.
 */
export function toOverrideCandidate(err: unknown): OverrideCandidate | null {
  const apiErr = err as { status?: number; code?: string; message?: string; details?: unknown };
  if (
    apiErr?.status === 409 &&
    typeof apiErr.code === 'string' &&
    CONFLICT_CODES.includes(apiErr.code as ConflictCode)
  ) {
    return {
      code: apiErr.code as ConflictCode,
      message: apiErr.message ?? 'Conflict detected.',
      details: (apiErr.details as ConflictDetails | undefined) ?? null,
    };
  }
  return null;
}
