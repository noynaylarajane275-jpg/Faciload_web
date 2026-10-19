import { Prisma, type ScheduleSlot } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { DAY_ORDER, type DayOfWeek, type SessionType } from '../types/domain.js';
import { timeOfDayToMinutes } from '../utils/time.js';

export interface ScheduleSlotListFilters {
  termId: string | null;
  facultyId: string | null;
  sectionId: string | null;
  /**
   * Room scoping for the read-only utilization views ("Classroom Utilization").
   * Omitted = all rooms, so the existing grid list call is unchanged.
   */
  roomId?: string | null;
}

export interface ScheduleSlotCreateData {
  workload_assignment_id: string;
  room_id: string | null;
  session_type: SessionType;
  day_of_week: DayOfWeek;
  /** Canonical "HH:MM" string (SQLite stores times as plain strings). */
  start_time: string;
  end_time: string;
}

export interface OverlapQuery {
  day: DayOfWeek;
  /** Canonical "HH:MM" strings — zero-padded, so lexicographic lt/gt in the
   *  overlap filter matches chronological order. */
  startTime: string;
  endTime: string;
  /** Ignore this slot — used when moving an existing block. */
  excludeSlotId?: string | null;
}

/** ScheduleSlot rows where the typed lecture/lab hour budget applies.
 *  The per-type cap is enforced at the service layer, not as a DB constraint
 *  (the budget is on the related Subject/WorkloadAssignment, not the slot). */
export const scheduleSlotInclude = {
  room: true,
  workload_assignment: {
    include: { faculty: true, subject: true, section: true, term: true },
  },
} satisfies Prisma.ScheduleSlotInclude;

export type ScheduleSlotWithRelations = Prisma.ScheduleSlotGetPayload<{
  include: typeof scheduleSlotInclude;
}>;

/**
 * Reads go through the assignment, so a soft-deleted assignment's slots drop
 * out of the grid (and out of conflict checks) without deleting history.
 */
function listWhere(filters: ScheduleSlotListFilters): Prisma.ScheduleSlotWhereInput {
  return {
    workload_assignment: {
      deleted_at: null,
      ...(filters.termId ? { term_id: filters.termId } : {}),
      ...(filters.facultyId ? { faculty_id: filters.facultyId } : {}),
      ...(filters.sectionId ? { section_id: filters.sectionId } : {}),
    },
    ...(filters.roomId ? { room_id: filters.roomId } : {}),
  };
}

/** Rank of a day in grid order MON..SAT (unknown days sort last). */
const DAY_RANK = new Map<string, number>(DAY_ORDER.map((day, index) => [day, index]));

/**
 * Grid order (MON..SAT, then "HH:MM"): SQLite stores days as plain strings,
 * so `ORDER BY day_of_week` would sort alphabetically (FRI first). Sorting in
 * app code preserves the Postgres enum ordering the views and UI depend on.
 */
export function sortSlotsByDay<T extends { day_of_week: string; start_time: string }>(
  rows: T[],
): T[] {
  return [...rows].sort(
    (a, b) =>
      (DAY_RANK.get(a.day_of_week) ?? 99) - (DAY_RANK.get(b.day_of_week) ?? 99) ||
      a.start_time.localeCompare(b.start_time),
  );
}

export async function list(filters: ScheduleSlotListFilters): Promise<ScheduleSlotWithRelations[]> {
  const rows = await prisma.scheduleSlot.findMany({
    where: listWhere(filters),
    include: scheduleSlotInclude,
    orderBy: { start_time: 'asc' },
  });
  return sortSlotsByDay(rows);
}

export async function findById(id: string): Promise<ScheduleSlotWithRelations | null> {
  return prisma.scheduleSlot.findUnique({ where: { id }, include: scheduleSlotInclude });
}

/** Half-open interval overlap: [start, end) — touching ends do NOT overlap, so
 *  a 10:00–11:00 block may sit directly after a 9:00–10:00 one. */
function overlapWhere(query: OverlapQuery): Prisma.ScheduleSlotWhereInput {
  return {
    day_of_week: query.day,
    ...(query.excludeSlotId ? { id: { not: query.excludeSlotId } } : {}),
    start_time: { lt: query.endTime },
    end_time: { gt: query.startTime },
  };
}

/** Slots already occupying this faculty member's time on that day. */
export async function findFacultyOverlaps(
  facultyId: string,
  query: OverlapQuery,
): Promise<ScheduleSlotWithRelations[]> {
  return prisma.scheduleSlot.findMany({
    where: {
      ...overlapWhere(query),
      workload_assignment: { faculty_id: facultyId, deleted_at: null },
    },
    include: scheduleSlotInclude,
    orderBy: { start_time: 'asc' },
  });
}

/** Slots already booking this room on that day. */
export async function findRoomOverlaps(
  roomId: string,
  query: OverlapQuery,
): Promise<ScheduleSlotWithRelations[]> {
  return prisma.scheduleSlot.findMany({
    where: { ...overlapWhere(query), room_id: roomId },
    include: scheduleSlotInclude,
    orderBy: { start_time: 'asc' },
  });
}

export async function create(data: ScheduleSlotCreateData): Promise<ScheduleSlotWithRelations> {
  return prisma.scheduleSlot.create({ data, include: scheduleSlotInclude });
}

export async function update(
  id: string,
  data: ScheduleSlotUpdateData,
): Promise<ScheduleSlotWithRelations> {
  return prisma.scheduleSlot.update({ where: { id }, data, include: scheduleSlotInclude });
}

export async function remove(id: string): Promise<void> {
  await prisma.scheduleSlot.delete({ where: { id } });
}

export interface ResetScope {
  termId: string;
  facultyId: string | null;
  roomId: string | null;
}

/**
 * Bulk-clear placed blocks for one term, scoped to all / one faculty /
 * one room. Matches only slots whose (non-deleted) assignment belongs to
 * the term, so clearing one faculty or room never touches the rest of the
 * grid. Assignments are untouched — they fall back to "unassigned".
 */
export async function removeMany(scope: ResetScope): Promise<number> {
  const result = await prisma.scheduleSlot.deleteMany({
    where: {
      workload_assignment: {
        deleted_at: null,
        term_id: scope.termId,
        ...(scope.facultyId ? { faculty_id: scope.facultyId } : {}),
      },
      ...(scope.roomId ? { room_id: scope.roomId } : {}),
    },
  });
  return result.count;
}

export type ScheduleSlotUpdateData = Partial<
  Pick<ScheduleSlotCreateData, 'room_id' | 'session_type' | 'day_of_week' | 'start_time' | 'end_time'>
>;

/** Sum of session_hours already placed for an assignment, broken down by type.
 *  When `excludeSlotId` is given the slot being moved/updated is excluded so the
 *  capacity check doesn't double-count it. */
export async function sumSessionHours(
  assignmentId: string,
  sessionType: SessionType,
  excludeSlotId?: string,
): Promise<number> {
  const rows = await prisma.scheduleSlot.findMany({
    where: {
      workload_assignment_id: assignmentId,
      session_type: sessionType,
      workload_assignment: { deleted_at: null },
      ...(excludeSlotId ? { id: { not: excludeSlotId } } : {}),
    },
    select: { start_time: true, end_time: true },
  });
  return rows.reduce((sum, r) => sum + slotHours(r.start_time, r.end_time), 0);
}

/**
 * Length of a stored slot in hours. Times are canonical "HH:MM" strings
 * (SQLite migration) — no Date involved; minutes math via utils/time.ts.
 */
function slotHours(startTime: string, endTime: string): number {
  const minutes = timeOfDayToMinutes(endTime) - timeOfDayToMinutes(startTime);
  return Math.round((minutes / 60) * 100) / 100;
}
