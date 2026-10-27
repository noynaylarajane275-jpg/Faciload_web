import type { DayOfWeek, SessionType } from '../types/domain.js';
import { z } from 'zod';
import { ApiError } from '../errors/apiError.js';
import * as facultyRepository from '../repositories/faculty.repository.js';
import * as roomRepository from '../repositories/room.repository.js';
import * as termRepository from '../repositories/term.repository.js';
import * as scheduleSlotRepository from '../repositories/schedule-slot.repository.js';
import type { ScheduleSlotWithRelations } from '../repositories/schedule-slot.repository.js';
import * as workloadAssignmentRepository from '../repositories/workload-assignment.repository.js';
import * as otherFunctionSessionRepository from '../repositories/other-function-session.repository.js';
import { detectPlacementConflict, type ConflictResult } from './conflict.service.js';
import {
  formatTimeOfDay,
  LUNCH_BREAK_END_MINUTES,
  LUNCH_BREAK_START_MINUTES,
  overlapsLunchBreak,
  parseTimeOfDay,
  timeOfDayToMinutes,
} from '../utils/time.js';
import {
  confirmOverrideSchema,
  createScheduleSlotSchema,
  resetScheduleSchema,
  scheduleSlotQuerySchema,
  updateScheduleSlotSchema,
  type ConfirmOverrideInput,
  type CreateScheduleSlotInput,
  type ResetScheduleInput,
  type UpdateScheduleSlotInput,
} from '../validation/schedule-slot.validation.js';
import { overScheduledError } from './over-scheduled.error.js';

export interface ScheduleSlotDto {
  id: string;
  workload_assignment_id: string;
  room_id: string | null;
  room_name: string | null;
  session_type: 'LECTURE' | 'LAB';
  day_of_week: DayOfWeek;
  /** "HH:MM" 24-hour — the grid does all of its own positioning math. */
  start_time: string;
  end_time: string;
  session_hours: number;
  faculty_id: string;
  faculty_name: string;
  subject_code: string;
  subject_title: string;
  subject_units: number;
  subject_lecture_hours: number;
  subject_lab_hours: number;
  section_id: string;
  section_label: string;
  term_id: string;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleSlotListDto {
  data: ScheduleSlotDto[];
  meta: { total: number };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface OverrideActor {
  userId: string;
  role: string;
}

function parseOrBadRequest<T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid request', parsed.error.flatten());
  }
  return parsed.data as z.infer<T>;
}

export function toScheduleSlotDto(slot: ScheduleSlotWithRelations): ScheduleSlotDto {
  const { workload_assignment: assignment } = slot;
  const lectureHours = Number(assignment.subject.lecture_hours || 0);
  const labHours = Number(assignment.subject.lab_hours || 0);
  const slotHours = (timeOfDayToMinutes(formatTimeOfDay(slot.end_time)) -
    timeOfDayToMinutes(formatTimeOfDay(slot.start_time))) / 60;
  return {
    id: slot.id,
    workload_assignment_id: slot.workload_assignment_id,
    room_id: slot.room_id,
    room_name: slot.room?.name ?? null,
    session_type: slot.session_type as SessionType,
    day_of_week: slot.day_of_week as DayOfWeek,
    start_time: formatTimeOfDay(slot.start_time),
    end_time: formatTimeOfDay(slot.end_time),
    session_hours: round2(slotHours),
    faculty_id: assignment.faculty_id,
    faculty_name: `${assignment.faculty.first_name} ${assignment.faculty.last_name}`,
    subject_code: assignment.subject.code,
    subject_title: assignment.subject.title,
    subject_units: Number(assignment.subject.units),
    subject_lecture_hours: lectureHours,
    subject_lab_hours: labHours,
    section_id: assignment.section_id,
    section_label: `${assignment.section.name} (Year ${assignment.section.year_level})`,
    term_id: assignment.term_id,
    color: assignment.color ?? null,
    created_at: slot.created_at.toISOString(),
    updated_at: slot.updated_at.toISOString(),
  };
}

export async function listScheduleSlots(rawQuery: unknown): Promise<ScheduleSlotListDto> {
  const query = parseOrBadRequest(scheduleSlotQuerySchema, rawQuery);
  const rows = await scheduleSlotRepository.list({
    termId: query.termId ?? null,
    facultyId: query.facultyId ?? null,
    sectionId: query.sectionId ?? null,
  });
  return { data: rows.map(toScheduleSlotDto), meta: { total: rows.length } };
}

/** Unknown room ids are a 400 (bad input), not a 404 — the room is a field. */
async function assertRoomExists(roomId: string | null): Promise<void> {
  if (!roomId) {
    return;
  }
  const room = await roomRepository.findById(roomId);
  if (!room) {
    throw ApiError.badRequest('Unknown room_id', { field: 'room_id' });
  }
}

/**
 * Reserved lunch break (12:00 PM – 1:00 PM, Mon–Sat). Rejects any placement
 * that touches the window — including a block that starts before noon and
 * ends after it. Hard 400 on every write path (create, move, override);
 * existing rows are never rewritten, only reported for review.
 */
function assertOutsideLunchBreak(startTime: string, endTime: string): void {
  const start = timeOfDayToMinutes(formatTimeOfDay(startTime));
  const end = timeOfDayToMinutes(formatTimeOfDay(endTime));
  if (overlapsLunchBreak(start, end)) {
    throw ApiError.badRequest(
      `Lunch break is reserved ${formatLunchRange()} — pick a slot that ends by 12:00 PM or starts at 1:00 PM`,
      { field: 'start_time' },
    );
  }
}

function formatLunchRange(): string {
  const fmt = (mins: number): string => {
    const h24 = Math.floor(mins / 60);
    const suffix = h24 < 12 ? 'AM' : 'PM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:00 ${suffix}`;
  };
  return `(${fmt(LUNCH_BREAK_START_MINUTES)} – ${fmt(LUNCH_BREAK_END_MINUTES)})`;
}

/**
 * Rejects a placement whose session-type hours would exceed the subject's
 * budgeted lecture/lab hours (database-specification.md §4.3).
 */
async function assertWithinSessionCapacity(
  assignment: { subject: { lecture_hours: unknown; lab_hours: unknown; code: string }; id: string },
  sessionType: 'LECTURE' | 'LAB',
  placedHours: number,
  excludeSlotId?: string,
): Promise<void> {
  const limit = sessionType === 'LECTURE'
    ? Number(assignment.subject.lecture_hours)
    : Number(assignment.subject.lab_hours);
  if (limit === 0) {
    return; // No budget tracked for this type — allow any placement.
  }
  const alreadyPlaced = await scheduleSlotRepository.sumSessionHours(
    assignment.id,
    sessionType,
    excludeSlotId,
  );
  const totalAfter = alreadyPlaced + placedHours;
  if (totalAfter > limit) {
    throw overScheduledError(
      assignment.subject.code as string,
      sessionType,
      alreadyPlaced,
      placedHours,
      limit,
    );
  }
}

/**
 * Single-meeting cap: one block cannot span more than one meeting's worth —
 * LECTURE ≤ 2h, LAB ≤ 3h. Bigger budgets are placed as multiple blocks, so
 * this is a hard 400 (unlike the conflict codes, there is nothing to override).
 */
const BLOCK_CAP_HOURS = { LECTURE: 2, LAB: 3 } as const;

function assertWithinBlockCap(sessionType: 'LECTURE' | 'LAB', hours: number): void {
  const cap = BLOCK_CAP_HOURS[sessionType];
  if (hours > cap + 1e-9) {
    throw ApiError.badRequest(
      `A ${sessionType.toLowerCase()} block cannot exceed ${cap} hours in one meeting`,
      { field: 'end_time' },
    );
  }
}

/** Conflict → 409 with the structured `{ code, details }` body the UI's
 *  override flow reads (FACULTY_CONFLICT / ROOM_CONFLICT / ROOM_MAINTENANCE). */
export function conflictToApiError(conflict: ConflictResult): ApiError {
  return ApiError.conflict(conflict.code, conflict.message, conflict.details);
}

async function assertNoOtherFunctionConflict(
  facultyId: string,
  termId: string,
  day: DayOfWeek,
  startTime: string,
  endTime: string,
): Promise<void> {
  const conflict = await otherFunctionSessionRepository.findOtherFunctionOverlap(
    facultyId,
    termId,
    day,
    startTime,
    endTime,
  );
  if (conflict === 'OTHER_FUNCTION') {
    throw ApiError.conflict(
      'OTHER_FUNCTION_CONFLICT',
      'This time overlaps an other-function session for this instructor.',
    );
  }
  if (conflict === 'DESIGNATION') {
    throw ApiError.conflict(
      'DESIGNATION_SESSION_CONFLICT',
      'This time overlaps a designation session for this instructor.',
    );
  }
}

export async function createScheduleSlot(rawBody: unknown): Promise<ScheduleSlotDto> {
  const input: CreateScheduleSlotInput = parseOrBadRequest(createScheduleSlotSchema, rawBody);
  const assignment = await workloadAssignmentRepository.findActiveById(input.workload_assignment_id);
  if (!assignment) {
    throw ApiError.notFound('Workload assignment not found');
  }
  const roomId = input.room_id ?? null;
  await assertRoomExists(roomId);

  const sessionType = input.session_type;
  const hours = (timeOfDayToMinutes(input.end_time) -
    timeOfDayToMinutes(input.start_time)) / 60;
  assertWithinBlockCap(sessionType, hours);
  assertOutsideLunchBreak(input.start_time, input.end_time);

  await assertWithinSessionCapacity(assignment, sessionType, hours);
  await assertNoOtherFunctionConflict(
    assignment.faculty_id,
    assignment.term_id,
    input.day_of_week,
    formatTimeOfDay(parseTimeOfDay(input.start_time)),
    formatTimeOfDay(parseTimeOfDay(input.end_time)),
  );

  const conflict = await detectPlacementConflict({
    facultyId: assignment.faculty_id,
    roomId,
    day: input.day_of_week,
    startTime: parseTimeOfDay(input.start_time),
    endTime: parseTimeOfDay(input.end_time),
  });
  if (conflict) {
    // Nothing is written: the client must explicitly confirm the override.
    throw conflictToApiError(conflict);
  }

  const slot = await scheduleSlotRepository.create({
    workload_assignment_id: assignment.id,
    room_id: roomId,
    session_type: input.session_type,
    day_of_week: input.day_of_week,
    start_time: parseTimeOfDay(input.start_time),
    end_time: parseTimeOfDay(input.end_time),
  });
  return toScheduleSlotDto(slot);
}

/**
 * Move/resize a placed block. The conflict check uses the merged placement
 * (incoming field falling back to the stored value) and excludes the slot
 * itself, so nudging a block by one hour never "conflicts with itself".
 */
export async function updateScheduleSlot(id: string, rawBody: unknown): Promise<ScheduleSlotDto> {
  const input: UpdateScheduleSlotInput = parseOrBadRequest(updateScheduleSlotSchema, rawBody);
  const existing = await scheduleSlotRepository.findById(id);
  if (!existing) {
    throw ApiError.notFound('Schedule slot not found');
  }

  const startTime =
    input.start_time !== undefined ? parseTimeOfDay(input.start_time) : existing.start_time;
  const endTime = input.end_time !== undefined ? parseTimeOfDay(input.end_time) : existing.end_time;
  if (timeOfDayToMinutes(formatTimeOfDay(endTime)) <= timeOfDayToMinutes(formatTimeOfDay(startTime))) {
    throw ApiError.badRequest('End time must be after start time', { field: 'end_time' });
  }
  const roomId = input.room_id === undefined ? existing.room_id : (input.room_id ?? null);
  await assertRoomExists(roomId);

  const sessionType =
    input.session_type !== undefined ? input.session_type : (existing.session_type as SessionType);
  const hours = (timeOfDayToMinutes(formatTimeOfDay(endTime)) -
    timeOfDayToMinutes(formatTimeOfDay(startTime))) / 60;
  assertWithinBlockCap(sessionType, hours);
  assertOutsideLunchBreak(startTime, endTime);

  await assertWithinSessionCapacity(existing.workload_assignment, sessionType, hours, id);
  await assertNoOtherFunctionConflict(
    existing.workload_assignment.faculty_id,
    existing.workload_assignment.term_id,
    (input.day_of_week ?? existing.day_of_week) as DayOfWeek,
    formatTimeOfDay(startTime),
    formatTimeOfDay(endTime),
  );

  const conflict = await detectPlacementConflict({
    facultyId: existing.workload_assignment.faculty_id,
    roomId,
    day: (input.day_of_week ?? existing.day_of_week) as DayOfWeek,
    startTime,
    endTime,
    excludeSlotId: id,
  });
  if (conflict) {
    throw conflictToApiError(conflict);
  }

  const slot = await scheduleSlotRepository.update(id, {
    room_id: roomId,
    session_type: sessionType,
    day_of_week: (input.day_of_week ?? existing.day_of_week) as DayOfWeek,
    start_time: startTime,
    end_time: endTime,
  });
  return toScheduleSlotDto(slot);
}

/**
 * Deliberate override: places the class even though the placement conflicts
 * (or the room is under maintenance). Same payload as the rejected request,
 * plus an optional reason.
 *
 * `:id` is the *workload assignment* being scheduled — the identity the UI
 * drags. Omit `slot_id` to create a new block; pass `slot_id` to move an
 * existing block that the PATCH conflict check rejected.
 *
 * Audit trail: there is no override table in database-specification.md, so the
 * override is recorded as a structured `console.warn` line carrying the actor,
 * the conflict that was bypassed, and the placement. Swapping that for a
 * dedicated audit table later only means replacing `logOverride`.
 */
export async function confirmOverride(
  assignmentId: string,
  rawBody: unknown,
  actor: OverrideActor,
): Promise<{ slot: ScheduleSlotDto; override: { applied: boolean; conflict: ConflictResult | null } }> {
  const input: ConfirmOverrideInput = parseOrBadRequest(confirmOverrideSchema, rawBody);
  const assignment = await workloadAssignmentRepository.findActiveById(assignmentId);
  if (!assignment) {
    throw ApiError.notFound('Workload assignment not found');
  }
  const roomId = input.room_id ?? null;
  await assertRoomExists(roomId);

  const startTime = parseTimeOfDay(input.start_time);
  const endTime = parseTimeOfDay(input.end_time);
  // Lunch break cannot be overridden — even the Chair override path rejects it.
  assertOutsideLunchBreak(startTime, endTime);
  await assertNoOtherFunctionConflict(
    assignment.faculty_id,
    assignment.term_id,
    input.day_of_week,
    formatTimeOfDay(startTime),
    formatTimeOfDay(endTime),
  );
  const overrideHours =
    (timeOfDayToMinutes(formatTimeOfDay(endTime)) - timeOfDayToMinutes(formatTimeOfDay(startTime))) / 60;

  // Re-evaluated only so the audit line records what was bypassed — this path
  // never throws on a conflict.
  const conflict = await detectPlacementConflict({
    facultyId: assignment.faculty_id,
    roomId,
    day: input.day_of_week,
    startTime,
    endTime,
    excludeSlotId: input.slot_id ?? null,
  });

  let slot: ScheduleSlotWithRelations;
  let action: 'created' | 'moved';
  if (input.slot_id) {
    const existing = await scheduleSlotRepository.findById(input.slot_id);
    if (!existing) {
      throw ApiError.notFound('Schedule slot not found');
    }
    if (existing.workload_assignment_id !== assignment.id) {
      throw ApiError.badRequest('Slot does not belong to this workload assignment', {
        field: 'slot_id',
      });
    }
    assertWithinBlockCap(
      (input.session_type ?? existing.session_type) as 'LECTURE' | 'LAB',
      overrideHours,
    );
    slot = await scheduleSlotRepository.update(input.slot_id, {
      room_id: roomId,
      session_type: (input.session_type ?? existing.session_type) as SessionType,
      day_of_week: input.day_of_week,
      start_time: startTime,
      end_time: endTime,
    });
    action = 'moved';
  } else {
    assertWithinBlockCap(input.session_type ?? 'LECTURE', overrideHours);
    slot = await scheduleSlotRepository.create({
      workload_assignment_id: assignment.id,
      room_id: roomId,
      session_type: input.session_type ?? 'LECTURE',
      day_of_week: input.day_of_week,
      start_time: startTime,
      end_time: endTime,
    });
    action = 'created';
  }

  logOverride({
    action,
    actor_user_id: actor.userId,
    actor_role: actor.role,
    workload_assignment_id: assignment.id,
    slot_id: slot.id,
    day_of_week: input.day_of_week,
    start_time: input.start_time,
    end_time: input.end_time,
    room_id: roomId,
    overridden_code: conflict?.code ?? null,
    overridden_message: conflict?.message ?? null,
    overridden_slot_ids: conflict?.details.conflicting_slots.map((row) => row.slot_id) ?? [],
    reason: input.override_reason ?? null,
  });
  return { slot: toScheduleSlotDto(slot), override: { applied: conflict !== null, conflict } };
}

export async function deleteScheduleSlot(id: string): Promise<void> {
  const existing = await scheduleSlotRepository.findById(id);
  if (!existing) {
    throw ApiError.notFound('Schedule slot not found');
  }
  await scheduleSlotRepository.remove(id);
}

export interface ResetScheduleResult {
  deleted_count: number;
  scope: 'all' | 'faculty' | 'room';
}

/**
 * Bulk-clear placed blocks for one term, scoped to all / one faculty /
 * one room. Verifies the caller's account password first (the route passes
 * the stored hash + candidate through), then hard-deletes the matching
 * ScheduleSlot rows in a single transaction. Assignments survive, so every
 * cleared class reappears under "Unassigned classes" with its full hour
 * budget restored.
 */
export async function resetSchedule(
  rawBody: unknown,
  actor: { userId: string; passwordHash: string | null; passwordCandidate: string },
): Promise<ResetScheduleResult> {
  const input: ResetScheduleInput = parseOrBadRequest(resetScheduleSchema, rawBody);
  if (!actor.passwordHash) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
  }
  const { verifyPassword } = await import('./auth.service.js');
  const passwordOk = await verifyPassword(actor.passwordCandidate, actor.passwordHash);
  if (!passwordOk) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Account password is incorrect');
  }
  const term = await termRepository.findById(input.term_id);
  if (!term) {
    throw ApiError.badRequest('Unknown term_id', { field: 'term_id' });
  }
  if (input.faculty_id) {
    const faculty = await facultyRepository.findActiveById(input.faculty_id);
    if (!faculty) {
      throw ApiError.badRequest('Unknown faculty_id', { field: 'faculty_id' });
    }
  }
  if (input.room_id) {
    const room = await roomRepository.findById(input.room_id);
    if (!room) {
      throw ApiError.badRequest('Unknown room_id', { field: 'room_id' });
    }
  }
  const scope = input.faculty_id ? 'faculty' : input.room_id ? 'room' : 'all';
  const deleted = await scheduleSlotRepository.removeMany({
    termId: input.term_id,
    facultyId: input.faculty_id ?? null,
    roomId: input.room_id ?? null,
  });
  return { deleted_count: deleted, scope };
}

function logOverride(payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.warn(`[schedule-slot] override ${JSON.stringify(payload)}`);
}