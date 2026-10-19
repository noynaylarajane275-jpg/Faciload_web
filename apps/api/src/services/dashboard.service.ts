import { z } from 'zod';
import { ApiError } from '../errors/apiError.js';
import type { AuthTokenPayload } from '../services/auth.service.js';
import { prisma } from '../config/prisma.js';
import { formatTimeOfDay, timeOfDayToMinutes } from '../utils/time.js';
import { dashboardSummaryQuerySchema } from '../validation/dashboard.validation.js';

/** Faculty load band thresholds (FR-06): >=90% = near, >=100% = over. */
const NEAR_LOAD_RATIO = 0.9;
const OVER_LOAD_RATIO = 1;

const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

export interface DepartmentLoadEntry {
  faculty_id: string;
  employee_no: string;
  name: string;
  scheduled_hours: number;
  max_units: number;
  load_ratio: number;
  status: 'near' | 'over';
}

export interface MaintenanceRoomEntry {
  id: string;
  name: string;
}

export interface BookedRoomEntry {
  room_id: string;
  room_name: string;
  booked_hours: number;
  slot_count: number;
}

/** One Mon–Sat bucket of plotted hours (chair dashboard weekly bar chart). */
export interface WeeklyHoursEntry {
  day_of_week: (typeof DAY_ORDER)[number];
  hours: number;
}

/** Booked / maintenance / free split over all rooms (stacked bar). */
export interface RoomUtilizationSummary {
  booked_pct: number;
  maintenance_pct: number;
  free_pct: number;
}

/** Per-faculty load line for the dark load panel — every faculty, not only near/over. */
export interface FacultyLoadEntry {
  faculty_id: string;
  employee_no: string;
  name: string;
  avatar_url: string | null;
  scheduled_hours: number;
  max_units: number;
  load_ratio: number;
  status: 'ok' | 'near' | 'over';
}

/** One plotted slot in the "this week" mini-grid preview. */
export interface WeekPreviewSlot {
  day_of_week: string;
  start_time: string;
  end_time: string;
  subject_code: string;
  section_label: string;
  session_type: 'LECTURE' | 'LAB';
}

/** Live status of one room for the rooms-status list. */
export interface RoomStatusEntry {
  room_id: string;
  room_name: string;
  status: 'available' | 'booked_now' | 'maintenance';
}

export interface WeekPreviewRoom {
  room_id: string;
  room_name: string;
  slots: WeekPreviewSlot[];
}

export interface DepartmentSummary {
  scope: 'department';
  term_id: string | null;
  /** Profile photo of the signed-in user ("me" mirror for the profile card). */
  avatar_url: string | null;
  faculty_count: number;
  subject_count: number;
  room_count: number;
  /** % of the term's assignment budget hours actually plotted on the grid. */
  term_scheduled_percent: number;
  /** % of rooms holding at least one plotted slot this term. */
  rooms_in_use_percent: number;
  weekly_plotted_hours: WeeklyHoursEntry[];
  room_utilization: RoomUtilizationSummary;
  /** Every faculty member with their load band (OK / NEAR / OVER). */
  faculty_load: FacultyLoadEntry[];
  near_or_over_count: number;
  /** Busiest room's plotted slots — the compact week preview. */
  this_week_preview: WeekPreviewRoom | null;
  rooms_status: RoomStatusEntry[];
  // Legacy shape kept for the original panels (near/over list, maintenance
  // rooms, most-booked rooms, unscheduled count) — tests and panels depend on it.
  total_faculty: number;
  total_subjects: number;
  total_sections: number;
  total_rooms: number;
  faculty_near_or_over_load: DepartmentLoadEntry[];
  rooms_under_maintenance: MaintenanceRoomEntry[];
  most_booked_rooms: BookedRoomEntry[];
  unscheduled_assignments_count: number;
}

export interface PersonalClassEntry {
  day_of_week: string;
  start_time: string;
  end_time: string;
  subject_code: string;
  subject_title: string;
  section_label: string;
  room_name: string | null;
}

export interface PersonalSummary {
  scope: 'personal';
  term_id: string | null;
  avatar_url: string | null;
  faculty_id: string;
  faculty_name: string;
  my_total_hours: number;
  my_scheduled_hours: number;
  my_remaining_hours: number;
  max_units: number;
  load_ratio: number;
  load_status: 'ok' | 'near' | 'over';
  my_subjects_count: number;
  todays_classes: PersonalClassEntry[];
  my_next_class: PersonalClassEntry | null;
}

export type DashboardSummary = DepartmentSummary | PersonalSummary;


function parseQuery(rawQuery: unknown): { termId?: string } {
  const parsed = dashboardSummaryQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid request', parsed.error.flatten());
  }
  return parsed.data;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function slotHours(start: string, end: string): number {
  const startMin = timeOfDayToMinutes(start);
  const endMin = timeOfDayToMinutes(end);
  return Math.round(((endMin - startMin) / 60) * 100) / 100;
}

/** Resolve the working term: explicit termId wins, else active term, else null (all terms). */
async function resolveTermId(explicitTermId?: string): Promise<string | null> {
  if (explicitTermId) {
    const term = await prisma.academicTerm.findUnique({ where: { id: explicitTermId } });
    if (!term) {
      throw ApiError.notFound('Term not found');
    }
    return term.id;
  }
  const active = await prisma.academicTerm.findFirst({
    where: { is_active: true },
    orderBy: { created_at: 'asc' },
  });
  return active?.id ?? null;
}

function dayRank(day: string): number {
  const index = (DAY_ORDER as readonly string[]).indexOf(day);
  return index < 0 ? 99 : index;
}

type PersonalClassRow = {
  day_of_week: string;
  start_time: string;
  end_time: string;
  workload_assignment: {
    subject: { code: string; title: string };
    section: { name: string; year_level: number };
  };
  room: { name: string } | null;
};

function toPersonalClass(row: PersonalClassRow): PersonalClassEntry {
  return {
    day_of_week: row.day_of_week,
    start_time: formatTimeOfDay(row.start_time),
    end_time: formatTimeOfDay(row.end_time),
    subject_code: row.workload_assignment.subject.code,
    subject_title: row.workload_assignment.subject.title,
    section_label: `${row.workload_assignment.section.name} (Year ${row.workload_assignment.section.year_level})`,
    room_name: row.room?.name ?? null,
  };
}
export async function getDashboardSummary(
  rawQuery: unknown,
  actor: AuthTokenPayload,
): Promise<DashboardSummary> {
  const { termId: explicitTermId } = parseQuery(rawQuery);
  const termId = await resolveTermId(explicitTermId);
  const termFilter = termId ? { term_id: termId } : {};
  // Mirror the signed-in user's avatar into the summary so the dashboard
  // profile card renders without an extra round-trip.
  const me = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { avatar_url: true },
  });
  if (actor.role === 'FACULTY') {
    return getPersonalSummary(actor, termId, termFilter, me?.avatar_url ?? null);
  }
  return getDepartmentSummary(termId, termFilter, me?.avatar_url ?? null);
}

/** Server-local weekday → our MON..SAT enum (Sunday has no plotted classes). */
const JS_DAY_TO_ENUM = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'MON'] as const;

type SlotRow = {
  room_id: string | null;
  room: { name: string; is_under_maintenance: boolean } | null;
  day_of_week: string;
  start_time: string;
  end_time: string;
  session_type: string;
  workload_assignment: {
    subject: { code: string };
    section: { name: string; year_level: number };
  };
};

/** Is this slot covering the wall-clock "now" (server-local time)? */
function slotCoversNow(row: SlotRow, now: Date): boolean {
  const enumToday = JS_DAY_TO_ENUM[now.getDay()];
  if (row.day_of_week !== enumToday) return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = timeOfDayToMinutes(row.start_time);
  const endMin = timeOfDayToMinutes(row.end_time);
  return nowMin >= startMin && nowMin < endMin;
}

async function getDepartmentSummary(
  termId: string | null,
  termFilter: { term_id?: string },
  avatarUrl: string | null,
): Promise<DepartmentSummary> {
  const [facultyRows, totalSubjects, totalSections, rooms, assignments, slots] = await Promise.all([
    prisma.faculty.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        employee_no: true,
        first_name: true,
        last_name: true,
        max_units: true,
        avatar_url: true,
      },
    }),
    prisma.subject.count({ where: { deleted_at: null } }),
    prisma.section.count(),
    prisma.room.findMany({ orderBy: [{ name: 'asc' }] }),
    prisma.workloadAssignment.findMany({
      where: { deleted_at: null, ...termFilter },
      include: {
        slots: { select: { start_time: true, end_time: true, session_type: true } },
        subject: { select: { lecture_hours: true, lab_hours: true, units: true } },
      },
    }),
    prisma.scheduleSlot.findMany({
      where: { workload_assignment: { deleted_at: null, ...termFilter } },
      select: {
        room_id: true,
        room: { select: { name: true, is_under_maintenance: true } },
        day_of_week: true,
        start_time: true,
        end_time: true,
        session_type: true,
        workload_assignment: {
          select: {
            subject: { select: { code: true } },
            section: { select: { name: true, year_level: true } },
          },
        },
      },
      orderBy: [{ day_of_week: 'asc' }, { start_time: 'asc' }],
    }),
  ]);

  const scheduledByFaculty = new Map<string, number>();
  for (const assignment of assignments) {
    let total = 0;
    for (const slot of assignment.slots) {
      total += slotHours(slot.start_time, slot.end_time);
    }
    scheduledByFaculty.set(
      assignment.faculty_id,
      round2((scheduledByFaculty.get(assignment.faculty_id) ?? 0) + total),
    );
  }

  // Full load board: every faculty member with their band, plus the legacy
  // near/over subset (same rows, filtered) for the original panel.
  const faculty_load: FacultyLoadEntry[] = facultyRows.map((member) => {
    const scheduled = round2(scheduledByFaculty.get(member.id) ?? 0);
    const ratio = member.max_units > 0 ? round2(scheduled / member.max_units) : 0;
    return {
      faculty_id: member.id,
      employee_no: member.employee_no,
      name: `${member.first_name} ${member.last_name}`,
      avatar_url: member.avatar_url ?? null,
      scheduled_hours: scheduled,
      max_units: member.max_units,
      load_ratio: ratio,
      status: ratio >= OVER_LOAD_RATIO ? 'over' : ratio >= NEAR_LOAD_RATIO ? 'near' : 'ok',
    };
  });
  faculty_load.sort((a, b) => b.load_ratio - a.load_ratio || a.name.localeCompare(b.name));
  const faculty_near_or_over_load: DepartmentLoadEntry[] = faculty_load
    .filter((entry) => entry.status !== 'ok')
    .map((entry) => ({
      faculty_id: entry.faculty_id,
      employee_no: entry.employee_no,
      name: entry.name,
      scheduled_hours: entry.scheduled_hours,
      max_units: entry.max_units,
      load_ratio: entry.load_ratio,
      status: entry.status === 'over' ? 'over' : 'near',
    }));

  let unscheduled_assignments_count = 0;
  let totalBudgetHours = 0;
  for (const assignment of assignments) {
    const lectureBudget = Number(assignment.subject.lecture_hours ?? 0);
    const labBudget = Number(assignment.subject.lab_hours ?? 0);
    totalBudgetHours +=
      lectureBudget + labBudget > 0
        ? lectureBudget + labBudget
        : Number(assignment.subject.units ?? 0) || 0;
    let scheduledLecture = 0;
    let scheduledLab = 0;
    for (const slot of assignment.slots) {
      const hours = round2(slotHours(slot.start_time, slot.end_time));
      if (slot.session_type === 'LECTURE') scheduledLecture = round2(scheduledLecture + hours);
      else scheduledLab = round2(scheduledLab + hours);
    }
    const remainingLecture = Math.max(0, round2(lectureBudget - scheduledLecture));
    const remainingLab = Math.max(0, round2(labBudget - scheduledLab));
    if (remainingLecture > 0 || remainingLab > 0) {
      unscheduled_assignments_count += 1;
    } else if (lectureBudget + labBudget <= 0) {
      if (round2(scheduledLecture + scheduledLab) <= 0) unscheduled_assignments_count += 1;
    }
  }

  const totalScheduledHours = slots.reduce(
    (sum, slot) => sum + slotHours(slot.start_time, slot.end_time),
    0,
  );
  const term_scheduled_percent =
    totalBudgetHours > 0 ? Math.min(100, round2((totalScheduledHours / totalBudgetHours) * 100)) : 0;

  // Weekly plotted hours (Mon–Sat) across all rooms.
  const hoursByDay = new Map<string, number>();
  for (const day of DAY_ORDER) hoursByDay.set(day, 0);
  for (const slot of slots) {
    hoursByDay.set(
      slot.day_of_week,
      round2((hoursByDay.get(slot.day_of_week) ?? 0) + slotHours(slot.start_time, slot.end_time)),
    );
  }
  const weekly_plotted_hours: WeeklyHoursEntry[] = DAY_ORDER.map((day) => ({
    day_of_week: day,
    hours: hoursByDay.get(day) ?? 0,
  }));

  const bookedByRoom = new Map<string, { room_name: string; booked_hours: number; slot_count: number }>();
  for (const slot of slots) {
    if (!slot.room_id) continue;
    const entry = bookedByRoom.get(slot.room_id) ?? {
      room_name: slot.room?.name ?? 'Unknown room',
      booked_hours: 0,
      slot_count: 0,
    };
    entry.booked_hours = round2(entry.booked_hours + slotHours(slot.start_time, slot.end_time));
    entry.slot_count += 1;
    bookedByRoom.set(slot.room_id, entry);
  }
  const most_booked_rooms: BookedRoomEntry[] = [...bookedByRoom.entries()]
    .map(([room_id, entry]) => ({ room_id, ...entry }))
    .sort((a, b) => b.booked_hours - a.booked_hours || b.slot_count - a.slot_count)
    .slice(0, 5);

  // Room utilization split over the full inventory: a maintenance room is
  // never "booked", rooms holding ≥1 slot are in use, the rest are free.
  const roomCount = rooms.length;
  const bookedRoomIds = new Set<string>();
  for (const slot of slots) {
    if (slot.room_id) bookedRoomIds.add(slot.room_id);
  }
  const maintenanceCount = rooms.filter((room) => room.is_under_maintenance).length;
  const bookedCount = [...bookedRoomIds].filter((id) => {
    const room = rooms.find((candidate) => candidate.id === id);
    return room !== undefined && !room.is_under_maintenance;
  }).length;
  const maintenance_pct = roomCount > 0 ? round2((maintenanceCount / roomCount) * 100) : 0;
  const booked_pct = roomCount > 0 ? round2((bookedCount / roomCount) * 100) : 0;
  const room_utilization: RoomUtilizationSummary = {
    booked_pct,
    maintenance_pct,
    free_pct: Math.max(0, round2(100 - booked_pct - maintenance_pct)),
  };

  // "This week" preview: the single busiest room's plotted slots.
  const busiest = most_booked_rooms[0] ?? null;
  const previewRoom = busiest ? rooms.find((room) => room.id === busiest.room_id) : undefined;
  const this_week_preview: WeekPreviewRoom | null =
    busiest && previewRoom
      ? {
          room_id: busiest.room_id,
          room_name: previewRoom.name,
          slots: slots
            .filter((slot) => slot.room_id === busiest.room_id)
            .sort(
              (a, b) =>
                dayRank(a.day_of_week) - dayRank(b.day_of_week) ||
                a.start_time.localeCompare(b.start_time),
            )
            .map((slot) => ({
              day_of_week: slot.day_of_week,
              start_time: formatTimeOfDay(slot.start_time),
              end_time: formatTimeOfDay(slot.end_time),
              subject_code: slot.workload_assignment.subject.code,
              section_label: `${slot.workload_assignment.section.name} (Year ${slot.workload_assignment.section.year_level})`,
              session_type: slot.session_type as 'LECTURE' | 'LAB',
            })),
        }
      : null;

  // Live per-room status for the rooms list (maintenance flag wins; "booked
  // now" = a slot covering this wall-clock moment, server-local time).
  const now = new Date();
  const rooms_status: RoomStatusEntry[] = rooms.map((room) => ({
    room_id: room.id,
    room_name: room.name,
    status: room.is_under_maintenance
      ? 'maintenance'
      : slots.some((slot) => slot.room_id === room.id && slotCoversNow(slot, now))
        ? 'booked_now'
        : 'available',
  }));

  return {
    scope: 'department',
    term_id: termId,
    avatar_url: avatarUrl,
    faculty_count: facultyRows.length,
    subject_count: totalSubjects,
    room_count: roomCount,
    term_scheduled_percent,
    rooms_in_use_percent: booked_pct,
    weekly_plotted_hours,
    room_utilization,
    faculty_load,
    near_or_over_count: faculty_near_or_over_load.length,
    this_week_preview,
    rooms_status,
    total_faculty: facultyRows.length,
    total_subjects: totalSubjects,
    total_sections: totalSections,
    total_rooms: roomCount,
    faculty_near_or_over_load,
    rooms_under_maintenance: rooms
      .filter((room) => room.is_under_maintenance)
      .map((room) => ({ id: room.id, name: room.name })),
    most_booked_rooms,
    unscheduled_assignments_count,
  };
}
async function getPersonalSummary(
  actor: AuthTokenPayload,
  termId: string | null,
  termFilter: { term_id?: string },
  avatarUrl: string | null = null,
): Promise<PersonalSummary> {
  if (!actor.facultyId) {
    return {
      scope: 'personal',
      term_id: termId,
      avatar_url: avatarUrl,
      faculty_id: '',
      faculty_name: '',
      my_total_hours: 0,
      my_scheduled_hours: 0,
      my_remaining_hours: 0,
      max_units: 0,
      load_ratio: 0,
      load_status: 'ok',
      my_subjects_count: 0,
      todays_classes: [],
      my_next_class: null,
    };
  }
  const faculty = await prisma.faculty.findFirst({
    where: { id: actor.facultyId, deleted_at: null },
  });
  if (!faculty) {
    throw ApiError.notFound('Faculty member not found');
  }
  const assignments = await prisma.workloadAssignment.findMany({
    where: { deleted_at: null, faculty_id: faculty.id, ...termFilter },
    include: {
      subject: { select: { lecture_hours: true, lab_hours: true, units: true } },
      slots: { select: { start_time: true, end_time: true, session_type: true } },
    },
  });
  let scheduled = 0;
  let weeklyTotal = 0;
  const subjectIds = new Set<string>();
  for (const assignment of assignments) {
    subjectIds.add(assignment.subject_id);
    const lecture = Number(assignment.subject.lecture_hours ?? 0);
    const lab = Number(assignment.subject.lab_hours ?? 0);
    const budget = lecture + lab > 0 ? lecture + lab : Number(assignment.subject.units ?? 0) || 0;
    weeklyTotal = round2(weeklyTotal + budget);
    for (const slot of assignment.slots) {
      scheduled = round2(scheduled + slotHours(slot.start_time, slot.end_time));
    }
  }
  scheduled = round2(scheduled);
  const remaining = Math.max(0, round2(weeklyTotal - scheduled));
  const ratio = faculty.max_units > 0 ? round2(scheduled / faculty.max_units) : 0;
  const load_status = ratio >= OVER_LOAD_RATIO ? 'over' : ratio >= NEAR_LOAD_RATIO ? 'near' : 'ok';
  const rows = await prisma.scheduleSlot.findMany({
    where: { workload_assignment: { deleted_at: null, faculty_id: faculty.id, ...termFilter } },
    include: {
      room: { select: { name: true } },
      workload_assignment: {
        select: {
          subject: { select: { code: true, title: true } },
          section: { select: { name: true, year_level: true } },
        },
      },
    },
    orderBy: [{ day_of_week: 'asc' }, { start_time: 'asc' }],
  });
  const classes = rows.map(toPersonalClass);
  const byDay = new Map<string, PersonalClassEntry[]>();
  for (const entry of classes) {
    const list = byDay.get(entry.day_of_week) ?? [];
    list.push(entry);
    byDay.set(entry.day_of_week, list);
  }
  const orderedDays = [...byDay.keys()].sort((a, b) => dayRank(a) - dayRank(b));
  const todays_classes = orderedDays.length > 0 ? (byDay.get(orderedDays[0]) ?? []) : [];
  const sortedAll = [...classes].sort(
    (a, b) => dayRank(a.day_of_week) - dayRank(b.day_of_week) || a.start_time.localeCompare(b.start_time),
  );
  return {
    scope: 'personal',
    term_id: termId,
    avatar_url: avatarUrl,
    faculty_id: faculty.id,
    faculty_name: `${faculty.first_name} ${faculty.last_name}`,
    my_total_hours: weeklyTotal,
    my_scheduled_hours: scheduled,
    my_remaining_hours: remaining,
    max_units: faculty.max_units,
    load_ratio: ratio,
    load_status,
    my_subjects_count: subjectIds.size,
    todays_classes,
    my_next_class: sortedAll[0] ?? null,
  };
}



