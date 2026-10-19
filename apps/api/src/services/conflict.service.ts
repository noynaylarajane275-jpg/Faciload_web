import type { DayOfWeek } from '../types/domain.js';
import * as roomRepository from '../repositories/room.repository.js';
import * as scheduleSlotRepository from '../repositories/schedule-slot.repository.js';
import type { ScheduleSlotWithRelations } from '../repositories/schedule-slot.repository.js';
import { formatTimeOfDay, humanizeTimeOfDay } from '../utils/time.js';

/**
 * Conflict detection for the weekly grid.
 *
 * Every placement (create, move, override) funnels through
 * `detectPlacementConflict`, which reports at most one conflict — maintenance
 * first (the room is unusable at all), then a same-faculty double booking,
 * then a room double booking. The route turns a non-null result into a 409
 * carrying `{ code, details }` so the UI can offer an override instead of
 * silently refusing the drop.
 */
export type ConflictCode = 'FACULTY_CONFLICT' | 'ROOM_CONFLICT' | 'ROOM_MAINTENANCE';

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

export interface ConflictResult {
  code: ConflictCode;
  message: string;
  details: {
    /** Echo of the requested placement, so the client can retry verbatim. */
    day_of_week: DayOfWeek;
    start_time: string;
    end_time: string;
    faculty_id?: string;
    room_id?: string | null;
    room_name?: string;
    conflicting_slots: ConflictSlotSummary[];
  };
}

export interface DetectConflictInput {
  /** Faculty of the workload assignment being placed (always known). */
  facultyId: string;
  /** Room being requested; null/undefined = TBA (no room clash possible). */
  roomId?: string | null;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  /** Ignore this slot — passed when moving an existing block. */
  excludeSlotId?: string | null;
}

function summarize(slot: ScheduleSlotWithRelations): ConflictSlotSummary {
  return {
    slot_id: slot.id,
    assignment_id: slot.workload_assignment_id,
    day_of_week: slot.day_of_week as DayOfWeek,
    start_time: formatTimeOfDay(slot.start_time),
    end_time: formatTimeOfDay(slot.end_time),
    room_name: slot.room?.name ?? null,
    faculty_name: `${slot.workload_assignment.faculty.first_name} ${slot.workload_assignment.faculty.last_name}`,
    subject_code: slot.workload_assignment.subject.code,
    section_label: slot.workload_assignment.section.name,
  };
}

function rangeLabel(start: string, end: string): string {
  return `${humanizeTimeOfDay(formatTimeOfDay(start))}–${humanizeTimeOfDay(formatTimeOfDay(end))}`;
}

/**
 * Overlapping slots for the same faculty (through their WorkloadAssignments)
 * or the same room. Returns null when the placement is clean.
 *
 * Intervals are half-open: a 09:00–10:00 block followed by 10:00–11:00 is
 * allowed, while 09:30–10:30 clashes with both ends.
 */
export async function detectConflict(input: DetectConflictInput): Promise<ConflictResult | null> {
  const overlapQuery = {
    day: input.day,
    startTime: input.startTime,
    endTime: input.endTime,
    excludeSlotId: input.excludeSlotId ?? null,
  };

  if (input.facultyId) {
    const facultyOverlaps = await scheduleSlotRepository.findFacultyOverlaps(
      input.facultyId,
      overlapQuery,
    );
    const first = facultyOverlaps[0];
    if (first) {
      return {
        code: 'FACULTY_CONFLICT',
        message: `Faculty conflict: ${first.workload_assignment.faculty.first_name} ${
          first.workload_assignment.faculty.last_name
        } is already scheduled ${rangeLabel(first.start_time, first.end_time)} on ${input.day} (${
          first.workload_assignment.subject.code
        } · ${first.workload_assignment.section.name}).`,
        details: {
          day_of_week: input.day,
          start_time: formatTimeOfDay(input.startTime),
          end_time: formatTimeOfDay(input.endTime),
          faculty_id: input.facultyId,
          room_id: input.roomId ?? null,
          conflicting_slots: facultyOverlaps.map(summarize),
        },
      };
    }
  }

  if (input.roomId) {
    const roomOverlaps = await scheduleSlotRepository.findRoomOverlaps(input.roomId, overlapQuery);
    const first = roomOverlaps[0];
    if (first) {
      return {
        code: 'ROOM_CONFLICT',
        message: `Room conflict: ${first.room?.name ?? 'this room'} is already booked ${rangeLabel(
          first.start_time,
          first.end_time,
        )} on ${input.day} by ${first.workload_assignment.subject.code} · ${
          first.workload_assignment.section.name
        }.`,
        details: {
          day_of_week: input.day,
          start_time: formatTimeOfDay(input.startTime),
          end_time: formatTimeOfDay(input.endTime),
          faculty_id: input.facultyId,
          room_id: input.roomId,
          room_name: first.room?.name,
          conflicting_slots: roomOverlaps.map(summarize),
        },
      };
    }
  }

  return null;
}

/** True when the room is currently flagged under maintenance (unusable). */
export async function checkRoomMaintenance(roomId: string): Promise<boolean> {
  const room = await roomRepository.findById(roomId);
  return room?.is_under_maintenance ?? false;
}

/**
 * Full placement gate used by every write path: maintenance, then faculty
 * overlap, then room overlap. Returns null when the placement is clean.
 */
export async function detectPlacementConflict(
  input: DetectConflictInput,
): Promise<ConflictResult | null> {
  if (input.roomId) {
    const room = await roomRepository.findById(input.roomId);
    // Unknown room ids are a validation problem, not a conflict — route
    // handlers reject those with a 400 before reaching this point.
    if (room?.is_under_maintenance) {
      return {
        code: 'ROOM_MAINTENANCE',
        message: `Room maintenance: ${room.name} is currently flagged as under maintenance.`,
        details: {
          day_of_week: input.day,
          start_time: formatTimeOfDay(input.startTime),
          end_time: formatTimeOfDay(input.endTime),
          faculty_id: input.facultyId,
          room_id: input.roomId,
          room_name: room.name,
          conflicting_slots: [],
        },
      };
    }
  }
  return detectConflict(input);
}