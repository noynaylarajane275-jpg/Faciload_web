import { apiFetch } from './api';

/**
 * Client for GET /api/dashboard/summary — the department overview (FR-06/FR-08).
 * The response shape is role-scoped server-side: CHAIR / ACADEMIC_ADMIN get
 * the department aggregate, FACULTY get only their own personal summary.
 */

export interface DepartmentLoadEntry {
  faculty_id: string;
  employee_no: string;
  name: string;
  scheduled_hours: number;
  max_units: number;
  load_ratio: number;
  status: 'near' | 'over';
}

export interface WeeklyHoursEntry {
  day_of_week: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';
  hours: number;
}

export interface RoomUtilizationSummary {
  booked_pct: number;
  maintenance_pct: number;
  free_pct: number;
}

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

export interface WeekPreviewSlot {
  day_of_week: string;
  start_time: string;
  end_time: string;
  subject_code: string;
  section_label: string;
  session_type: 'LECTURE' | 'LAB';
}

export interface WeekPreviewRoom {
  room_id: string;
  room_name: string;
  slots: WeekPreviewSlot[];
}

export interface RoomStatusEntry {
  room_id: string;
  room_name: string;
  status: 'available' | 'booked_now' | 'maintenance';
}

export interface DepartmentSummary {
  scope: 'department';
  term_id: string | null;
  avatar_url: string | null;
  faculty_count: number;
  subject_count: number;
  room_count: number;
  term_scheduled_percent: number;
  rooms_in_use_percent: number;
  weekly_plotted_hours: WeeklyHoursEntry[];
  room_utilization: RoomUtilizationSummary;
  faculty_load: FacultyLoadEntry[];
  near_or_over_count: number;
  this_week_preview: WeekPreviewRoom | null;
  rooms_status: RoomStatusEntry[];
  total_faculty: number;
  total_subjects: number;
  total_sections: number;
  total_rooms: number;
  faculty_near_or_over_load: DepartmentLoadEntry[];
  rooms_under_maintenance: Array<{ id: string; name: string }>;
  most_booked_rooms: Array<{ room_id: string; room_name: string; booked_hours: number; slot_count: number }>;
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

export function getDashboardSummary(termId?: string): Promise<{ summary: DashboardSummary }> {
  const qs = termId ? `?termId=${encodeURIComponent(termId)}` : '';
  return apiFetch<{ summary: DashboardSummary }>(`/api/dashboard/summary${qs}`);
}

/**
 * POST /api/users/me/avatar — multipart profile-photo upload (shared by the
 * Dashboard profile card and Account Settings). Client-side checks mirror the
 * server's (JPG/PNG/WebP, ≤2MB) so obvious mistakes fail fast without a
 * round-trip; the server re-validates everything (content-sniffed).
 */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export function validateAvatarFile(file: File): string | null {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    return 'Photo must be a JPG, PNG or WebP image.';
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return 'Photo must be 2MB or smaller.';
  }
  return null;
}

export async function uploadAvatar(file: File): Promise<{ avatar_url: string }> {
  const body = new FormData();
  body.append('avatar', file);
  // FormData sets its own multipart Content-Type; skip apiFetch's JSON default.
  return apiFetch<{ avatar_url: string }>('/api/users/me/avatar', {
    method: 'POST',
    headers: {},
    body,
  });
}

export interface UpdateMeInput {
  email?: string;
  current_password: string;
  new_password?: string;
}

/**
 * PATCH /api/users/me — editable email / password for the signed-in account.
 * Every change requires the current password; the resolved user is returned
 * so the auth store can patch itself in place.
 */
export function updateMe(input: UpdateMeInput): Promise<{
  user: {
    id: string;
    email: string;
    role: 'CHAIR' | 'FACULTY' | 'ACADEMIC_ADMIN';
    facultyId: string | null;
    avatar_url: string | null;
  };
}> {
  return apiFetch('/api/users/me', { method: 'PATCH', body: JSON.stringify(input) });
}

