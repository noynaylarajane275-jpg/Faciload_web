import type { DayOfWeek } from '../types/domain.js';
import { z } from 'zod';
import { ApiError } from '../errors/apiError.js';
import * as facultyRepository from '../repositories/faculty.repository.js';
import * as roomRepository from '../repositories/room.repository.js';
import * as scheduleSlotRepository from '../repositories/schedule-slot.repository.js';
import type { ScheduleSlotWithRelations } from '../repositories/schedule-slot.repository.js';
import * as sectionRepository from '../repositories/section.repository.js';
import { formatTimeOfDay } from '../utils/time.js';
import { scheduleViewQuerySchema } from '../validation/schedule-view.validation.js';

/**
 * Read-only schedule views replacing the department's hand-copied paper
 * process: "Student Class Program" (per section), "Faculty Class Program"
 * (per instructor) and "Classroom Utilization" (per room). Every view is a
 * reshape of the SAME ScheduleSlot rows the drag-and-drop grid writes —
 * there is no second source of truth and no write path here.
 *
 * Rows arrive pre-sorted by day (Prisma enum order MON..SAT) then start time;
 * the frontend just renders them into a grid.
 */

/** One grid entry — exactly the fields the paper forms show per block. */
export interface ScheduleViewSlotDto {
  day_of_week: DayOfWeek;
  /** "HH:MM" 24-hour (same wire format as the grid's slot DTOs). */
  start_time: string;
  end_time: string;
  subject_code: string;
  subject_title: string;
  faculty_name: string;
  /** Display label ("1A (Year 1)") so sections in different years stay distinguishable. */
  section_name: string;
  /** null = TBA (slot placed without a room). */
  room_name: string | null;
  color: string | null;
}

export interface ScheduleViewListDto {
  data: ScheduleViewSlotDto[];
  meta: { total: number };
}

function parseQuery(rawQuery: unknown): z.infer<typeof scheduleViewQuerySchema> {
  const parsed = scheduleViewQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid request', parsed.error.flatten());
  }
  return parsed.data;
}

function toViewSlotDto(slot: ScheduleSlotWithRelations): ScheduleViewSlotDto {
  const { workload_assignment: assignment } = slot;
  return {
    day_of_week: slot.day_of_week as DayOfWeek,
    start_time: formatTimeOfDay(slot.start_time),
    end_time: formatTimeOfDay(slot.end_time),
    subject_code: assignment.subject.code,
    subject_title: assignment.subject.title,
    faculty_name: `${assignment.faculty.first_name} ${assignment.faculty.last_name}`,
    section_name: `${assignment.section.name} (Year ${assignment.section.year_level})`,
    room_name: slot.room?.name ?? null,
    color: assignment.color ?? null,
  };
}

export interface SectionScheduleViewDto extends ScheduleViewListDto {
  section: { id: string; name: string; year_level: number; label: string };
}

/** "Student Class Program" — every slot booked by the section's assignments. */
export async function getSectionScheduleView(
  sectionId: string,
  rawQuery: unknown,
): Promise<SectionScheduleViewDto> {
  const { termId } = parseQuery(rawQuery);
  const section = await sectionRepository.findById(sectionId);
  if (!section) {
    throw ApiError.notFound('Section not found');
  }
  const rows = await scheduleSlotRepository.list({
    termId: termId ?? null,
    facultyId: null,
    sectionId,
  });
  return {
    section: {
      id: section.id,
      name: section.name,
      year_level: section.year_level,
      label: `${section.name} (Year ${section.year_level})`,
    },
    data: rows.map(toViewSlotDto),
    meta: { total: rows.length },
  };
}

export interface FacultyScheduleViewDto extends ScheduleViewListDto {
  faculty: {
    id: string;
    employee_no: string;
    first_name: string;
    last_name: string;
    name: string;
  };
}

/** "Faculty Class Program" — every slot the faculty member teaches, all sections. */
export async function getFacultyScheduleView(
  facultyId: string,
  rawQuery: unknown,
): Promise<FacultyScheduleViewDto> {
  const { termId } = parseQuery(rawQuery);
  const faculty = await facultyRepository.findActiveById(facultyId);
  if (!faculty) {
    throw ApiError.notFound('Faculty member not found');
  }
  const rows = await scheduleSlotRepository.list({
    termId: termId ?? null,
    facultyId,
    sectionId: null,
  });
  return {
    faculty: {
      id: faculty.id,
      employee_no: faculty.employee_no,
      first_name: faculty.first_name,
      last_name: faculty.last_name,
      name: `${faculty.first_name} ${faculty.last_name}`,
    },
    data: rows.map(toViewSlotDto),
    meta: { total: rows.length },
  };
}

export interface RoomScheduleViewDto extends ScheduleViewListDto {
  room: { id: string; name: string };
}

/** One "Classroom Utilization" room tab — every slot booked into the room. */
export async function getRoomScheduleView(
  roomId: string,
  rawQuery: unknown,
): Promise<RoomScheduleViewDto> {
  const { termId } = parseQuery(rawQuery);
  const room = await roomRepository.findById(roomId);
  if (!room) {
    throw ApiError.notFound('Room not found');
  }
  const rows = await scheduleSlotRepository.list({
    termId: termId ?? null,
    facultyId: null,
    sectionId: null,
    roomId,
  });
  return {
    room: { id: room.id, name: room.name },
    data: rows.map(toViewSlotDto),
    meta: { total: rows.length },
  };
}

export interface RoomsOverviewEntry {
  room_id: string;
  room_name: string;
  slots: ScheduleViewSlotDto[];
}

export interface RoomsOverviewDto {
  rooms: RoomsOverviewEntry[];
  meta: { total_rooms: number };
}

/**
 * All rooms' schedules in a single response (the workbook's per-room tabs at
 * once), so the Rooms view can offer a tab switcher without N requests.
 * One schedule query is grouped in-process; rooms with no booked slots still
 * appear with an empty array so every room always has a tab, mirroring the
 * spreadsheet.
 */
export async function getRoomsOverview(rawQuery: unknown): Promise<RoomsOverviewDto> {
  const { termId } = parseQuery(rawQuery);
  const [rooms, rows] = await Promise.all([
    roomRepository.list(null),
    scheduleSlotRepository.list({ termId: termId ?? null, facultyId: null, sectionId: null }),
  ]);
  const slotsByRoom = new Map<string, ScheduleViewSlotDto[]>(rooms.map((room) => [room.id, []]));
  for (const row of rows) {
    if (row.room_id) {
      slotsByRoom.get(row.room_id)?.push(toViewSlotDto(row));
    }
  }
  return {
    rooms: rooms.map((room) => ({
      room_id: room.id,
      room_name: room.name,
      slots: slotsByRoom.get(room.id) ?? [],
    })),
    meta: { total_rooms: rooms.length },
  };
}
