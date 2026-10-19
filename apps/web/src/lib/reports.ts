import type { WorkloadAssignment } from './workload-assignments';
import type { ScheduleViewSlot } from './schedule-views';
import type { DayOfWeek, ScheduleSlot } from './schedule-slots';

export interface FacultyWorkloadRow {
  faculty_id: string;
  faculty_name: string;
  employee_no: string;
  max_units: number;
  subjects: number;
  weekly_hours: number;
  scheduled_hours: number;
  remaining_hours: number;
  load_ratio: number;
  status: 'ok' | 'near' | 'over';
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function statusOf(scheduled: number, maxUnits: number): 'ok' | 'near' | 'over' {
  if (!(maxUnits > 0)) return 'ok';
  const ratio = scheduled / maxUnits;
  if (ratio >= 1) return 'over';
  if (ratio >= 0.9) return 'near';
  return 'ok';
}

/** Aggregate assignments into one row per faculty member. */
export function aggregateWorkload(
  assignments: WorkloadAssignment[],
  facultyById: Map<string, { employee_no: string; max_units: number }>,
): FacultyWorkloadRow[] {
  const byFaculty = new Map<string, FacultyWorkloadRow>();
  for (const assignment of assignments) {
    const member = facultyById.get(assignment.faculty_id);
    const existing =
      byFaculty.get(assignment.faculty_id) ??
      ({
        faculty_id: assignment.faculty_id,
        faculty_name: assignment.faculty_name,
        employee_no: member?.employee_no ?? '',
        max_units: member?.max_units ?? 0,
        subjects: 0,
        weekly_hours: 0,
        scheduled_hours: 0,
        remaining_hours: 0,
        load_ratio: 0,
        status: 'ok' as const,
      } satisfies FacultyWorkloadRow);
    existing.subjects += 1;
    existing.weekly_hours = round2(existing.weekly_hours + assignment.weekly_hours);
    existing.scheduled_hours = round2(existing.scheduled_hours + assignment.scheduled_hours);
    existing.remaining_hours = round2(existing.remaining_hours + assignment.remaining_hours);
    byFaculty.set(assignment.faculty_id, existing);
  }
  for (const row of byFaculty.values()) {
    row.load_ratio =
      row.max_units > 0 ? round2(row.scheduled_hours / row.max_units) : 0;
    row.status = statusOf(row.scheduled_hours, row.max_units);
  }
  return [...byFaculty.values()].sort((a, b) =>
    a.faculty_name.localeCompare(b.faculty_name),
  );
}

/**
 * Adapt a read-only view row to the ScheduleSlot shape the Excel exporter
 * paints. View rows carry display names (not ids), so ids fall back to the
 * surrounding context — layout only needs day/time/labels/color.
 */
export function viewSlotToExportSlot(
  row: ScheduleViewSlot,
  index: number,
  fallback: { facultyId: string; sectionId: string; termId: string },
): ScheduleSlot {
  const now = new Date().toISOString();
  return {
    id: `report-slot-${index}`,
    workload_assignment_id: `report-assignment-${index}`,
    room_id: null,
    room_name: row.room_name,
    day_of_week: row.day_of_week as DayOfWeek,
    start_time: row.start_time,
    end_time: row.end_time,
    session_type: 'LECTURE',
    session_hours: 0,
    faculty_id: fallback.facultyId,
    faculty_name: row.faculty_name,
    subject_code: row.subject_code,
    subject_title: row.subject_title,
    subject_units: 0,
    section_id: fallback.sectionId,
    section_label: row.section_name,
    term_id: fallback.termId,
    color: row.color,
    created_at: now,
    updated_at: now,
  };
}

export function workloadToCsv(rows: FacultyWorkloadRow[]): string {
  const header = [
    'Faculty',
    'Employee No',
    'Subjects',
    'Weekly Hours',
    'Scheduled Hours',
    'Remaining Hours',
    'Max Units',
    'Status',
  ];
  const escape = (value: string | number): string => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = rows.map((row) =>
    [
      row.faculty_name,
      row.employee_no,
      row.subjects,
      row.weekly_hours,
      row.scheduled_hours,
      row.remaining_hours,
      row.max_units,
      row.status,
    ]
      .map(escape)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n');
}
