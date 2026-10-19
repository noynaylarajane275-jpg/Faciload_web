import { apiFetch } from './api';
import type { DayOfWeek } from './schedule-slots';

/**
 * Client for the read-only schedule views — the auto-generated replacements
 * for the department's hand-copied "Student Class Program" (per section),
 * "Faculty Class Program" (per instructor) and "Classroom Utilization"
 * (per room) sheets. The API already sorts rows by day then start time, so
 * the views render straight into a grid.
 */

/** One reshaped ScheduleSlot row — shared by all four view endpoints. */
export interface ScheduleViewSlot {
  day_of_week: DayOfWeek;
  /** "HH:MM" 24-hour. */
  start_time: string;
  end_time: string;
  subject_code: string;
  subject_title: string;
  faculty_name: string;
  /** Display label ("1A (Year 1)") so sections across years stay distinguishable. */
  section_name: string;
  /** null = TBA (slot placed without a room). */
  room_name: string | null;
  /** Custom assignment color (hex) or null for the default leaf look. */
  color: string | null;
}

export interface ScheduleViewList {
  data: ScheduleViewSlot[];
  meta: { total: number };
}

export interface SectionScheduleView extends ScheduleViewList {
  section: { id: string; name: string; year_level: number; label: string };
}

export interface FacultyScheduleView extends ScheduleViewList {
  faculty: {
    id: string;
    employee_no: string;
    first_name: string;
    last_name: string;
    name: string;
  };
}

export interface RoomScheduleView extends ScheduleViewList {
  room: { id: string; name: string };
}

export interface RoomsOverviewEntry {
  room_id: string;
  room_name: string;
  slots: ScheduleViewSlot[];
}

export interface RoomsOverview {
  rooms: RoomsOverviewEntry[];
  meta: { total_rooms: number };
}

function termQuery(termId?: string): string {
  return termId ? `?termId=${encodeURIComponent(termId)}` : '';
}

export function getSectionSchedule(
  sectionId: string,
  termId?: string,
): Promise<SectionScheduleView> {
  return apiFetch<SectionScheduleView>(
    `/api/schedule-views/section/${sectionId}${termQuery(termId)}`,
  );
}

export function getFacultySchedule(
  facultyId: string,
  termId?: string,
): Promise<FacultyScheduleView> {
  return apiFetch<FacultyScheduleView>(
    `/api/schedule-views/faculty/${facultyId}${termQuery(termId)}`,
  );
}

export function getRoomSchedule(roomId: string, termId?: string): Promise<RoomScheduleView> {
  return apiFetch<RoomScheduleView>(`/api/schedule-views/room/${roomId}${termQuery(termId)}`);
}

/** All rooms' schedules in one call — powers the Rooms tab switcher. */
export function getRoomsOverview(termId?: string): Promise<RoomsOverview> {
  return apiFetch<RoomsOverview>(`/api/schedule-views/rooms-overview${termQuery(termId)}`);
}
