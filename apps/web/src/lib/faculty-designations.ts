import { apiFetch } from './api';
import type { DayOfWeek } from './schedule-slots';

export interface DesignationSession {
  id: string;
  designation_id: string;
  title: string;
  day_of_week: Exclude<DayOfWeek, 'SAT'>;
  start_time: string;
  end_time: string;
  created_at: string;
}

export interface FacultyDesignation {
  id: string;
  faculty_id: string;
  term_id: string;
  name: string;
  total_hours: number;
  sessions: DesignationSession[];
  created_at: string;
}

export async function listFacultyDesignations(
  termId: string,
  facultyId: string,
): Promise<FacultyDesignation[]> {
  const query = new URLSearchParams({ termId, facultyId });
  const result = await apiFetch<{ data: FacultyDesignation[] }>(
    `/api/faculty-designations?${query.toString()}`,
  );
  return result.data;
}

export function createFacultyDesignation(input: {
  faculty_id: string;
  term_id: string;
  name: string;
}): Promise<{ designation: FacultyDesignation }> {
  return apiFetch<{ designation: FacultyDesignation }>('/api/faculty-designations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteFacultyDesignation(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/faculty-designations/${id}`, { method: 'DELETE' });
}

export function createDesignationSession(input: {
  designation_id: string;
  day_of_week: Exclude<DayOfWeek, 'SAT'>;
  start_time: string;
  end_time: string;
}): Promise<{ session: DesignationSession }> {
  return apiFetch<{ session: DesignationSession }>('/api/designation-sessions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteDesignationSession(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/designation-sessions/${id}`, { method: 'DELETE' });
}
