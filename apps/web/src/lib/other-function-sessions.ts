import { apiFetch } from './api';
import type { DayOfWeek } from './schedule-slots';

export type OtherFunctionType = 'RESEARCH' | 'EXTENSION' | 'IMP' | 'CONSULTATION';

export interface OtherFunctionSession {
  id: string;
  faculty_id: string;
  term_id: string;
  function_type: OtherFunctionType;
  title: string;
  day_of_week: Exclude<DayOfWeek, 'SAT'>;
  start_time: string;
  end_time: string;
  created_at: string;
}

export interface CreateOtherFunctionSessionInput {
  term_id: string;
  function_type: OtherFunctionType;
  day_of_week: Exclude<DayOfWeek, 'SAT'>;
  start_time: string;
  end_time: string;
}

export async function listOtherFunctionSessions(
  termId: string,
  facultyId: string,
): Promise<OtherFunctionSession[]> {
  const query = new URLSearchParams({ termId, facultyId });
  const result = await apiFetch<{ data: OtherFunctionSession[] }>(
    `/api/other-function-sessions?${query.toString()}`,
  );
  return result.data;
}

export function createOtherFunctionSession(
  input: CreateOtherFunctionSessionInput,
): Promise<{ session: OtherFunctionSession }> {
  return apiFetch<{ session: OtherFunctionSession }>('/api/other-function-sessions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteOtherFunctionSession(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/other-function-sessions/${id}`, { method: 'DELETE' });
}
