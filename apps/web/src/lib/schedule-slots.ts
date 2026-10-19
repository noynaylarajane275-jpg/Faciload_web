import { apiFetch } from './api';

export type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';

export type SessionType = 'LECTURE' | 'LAB';

export function sessionSessionLabel(type: SessionType): string {
  return type === 'LECTURE' ? 'LEC' : 'LAB';
}

export type ResetScope = 'all' | 'faculty' | 'room';

export interface ResetScheduleInput {
  term_id: string;
  faculty_id?: string;
  room_id?: string;
  password: string;
}

export interface ResetScheduleResult {
  deleted_count: number;
  scope: ResetScope;
}

/**
 * Bulk-clear placed blocks for the term (Chair-only). Assignments survive —
 * everything returns to "Unassigned classes". The caller's account password
 * travels in the body because DELETE cannot carry one safely and this call
 * is destructive by design.
 */
export function resetSchedule(input: ResetScheduleInput): Promise<ResetScheduleResult> {
  return apiFetch<ResetScheduleResult>('/api/schedule-slots/reset', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface ScheduleSlot {
  id: string;
  workload_assignment_id: string;
  room_id: string | null;
  room_name: string | null;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  session_type: SessionType;
  session_hours: number;
  faculty_id: string;
  faculty_name: string;
  subject_code: string;
  subject_title: string;
  subject_units: number;
  section_id: string;
  section_label: string;
  term_id: string;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleSlotListResult {
  data: ScheduleSlot[];
  meta: { total: number };
}

export interface ScheduleSlotQuery {
  termId?: string;
  facultyId?: string;
  sectionId?: string;
}

export interface ScheduleSlotPlacement {
  room_id?: string | null;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  session_type?: SessionType;
}

/** Conflict codes the API returns as a 409 `error.code`. */
export type ConflictCode =
  | 'FACULTY_CONFLICT'
  | 'ROOM_CONFLICT'
  | 'ROOM_MAINTENANCE'
  | 'OVER_SCHEDULED_LECTURE_HOURS'
  | 'OVER_SCHEDULED_LAB_HOURS';

export interface ConflictSlotSummary {
  slot_id: string;
  assignment_id: string;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  room_name: string | null;
  faculty_name: string;
  subject_code: string;
  section_label: string;
}

/**
 * Structured `error.details` from a 409 — enough for the override dialog to
 * show *what* clashes and to resend the exact placement on confirm.
 */
export interface ConflictDetails {
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  faculty_id?: string;
  room_id?: string | null;
  room_name?: string;
  conflicting_slots: ConflictSlotSummary[];
}

export function listScheduleSlots(query: ScheduleSlotQuery = {}): Promise<ScheduleSlotListResult> {
  const params = new URLSearchParams();
  if (query.termId) params.set('termId', query.termId);
  if (query.facultyId) params.set('facultyId', query.facultyId);
  if (query.sectionId) params.set('sectionId', query.sectionId);
  const qs = params.toString();
  return apiFetch<ScheduleSlotListResult>(`/api/schedule-slots${qs ? `?${qs}` : ''}`);
}

/** Clean placement → 201 with the slot. Conflicts surface as a 409 ApiError
 *  carrying `code` (ConflictCode) and `details` (ConflictDetails). */
export function createScheduleSlot(
  input: { workload_assignment_id: string } & ScheduleSlotPlacement,
): Promise<{ slot: ScheduleSlot }> {
  return apiFetch<{ slot: ScheduleSlot }>('/api/schedule-slots', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Moving/resizing a placed block re-runs the same conflict checks. */
export function updateScheduleSlot(
  id: string,
  input: Partial<ScheduleSlotPlacement>,
): Promise<{ slot: ScheduleSlot }> {
  return apiFetch<{ slot: ScheduleSlot }>(`/api/schedule-slots/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteScheduleSlot(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/schedule-slots/${id}`, { method: 'DELETE' });
}

/**
 * Place despite a known conflict. `assignmentId` is the class being scheduled
 * (the identity the UI drags); pass `slot_id` to move an existing block that
 * the PATCH check rejected, or omit it to create a new block.
 */
export function confirmOverride(
  assignmentId: string,
  input: { slot_id?: string; override_reason?: string } & ScheduleSlotPlacement,
): Promise<{
  slot: ScheduleSlot;
  override: { applied: boolean; conflict: ConflictDetails | null };
}> {
  return apiFetch<{
    slot: ScheduleSlot;
    override: { applied: boolean; conflict: ConflictDetails | null };
  }>(`/api/schedule-slots/${assignmentId}/confirm-override`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}