import { apiFetch } from './api';
import type { ScheduleSlot } from './schedule-slots';

export interface WorkloadAssignment {
  id: string;
  faculty_id: string;
  subject_id: string;
  section_id: string;
  term_id: string;
  faculty_name: string;
  subject_code: string;
  subject_title: string;
  subject_units: number;
  section_label: string;
  term_label: string;
  lecture_hours: number;
  lab_hours: number;
  scheduled_lecture_hours: number;
  scheduled_lab_hours: number;
  remaining_lecture_hours: number;
  remaining_lab_hours: number;
  weekly_hours: number;
  scheduled_hours: number;
  remaining_hours: number;
  color: string | null;
  slots: ScheduleSlot[];
  created_at: string;
}

export interface WorkloadAssignmentListMeta {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface WorkloadAssignmentListResult {
  data: WorkloadAssignment[];
  meta: WorkloadAssignmentListMeta;
}

export interface WorkloadAssignmentQuery {
  termId?: string;
  facultyId?: string;
  sectionId?: string;
  subjectId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface WorkloadAssignmentInput {
  faculty_id: string;
  subject_id: string;
  section_id: string;
  term_id: string;
}

export function listWorkloadAssignments(
  query: WorkloadAssignmentQuery = {},
): Promise<WorkloadAssignmentListResult> {
  const params = new URLSearchParams();
  if (query.termId) params.set('termId', query.termId);
  if (query.facultyId) params.set('facultyId', query.facultyId);
  if (query.sectionId) params.set('sectionId', query.sectionId);
  if (query.subjectId) params.set('subjectId', query.subjectId);
  if (query.search) params.set('search', query.search);
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  const qs = params.toString();
  return apiFetch<WorkloadAssignmentListResult>(
    `/api/workload-assignments${qs ? `?${qs}` : ''}`,
  );
}

/** Rejects duplicates (same faculty + subject + section + term) with a 409
 *  `WORKLOAD_ASSIGNMENT_DUPLICATE` naming the existing assignment. */
export function createWorkloadAssignment(
  input: WorkloadAssignmentInput,
): Promise<{ assignment: WorkloadAssignment }> {
  return apiFetch<{ assignment: WorkloadAssignment }>('/api/workload-assignments', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Soft delete on the server: the assignment drops out of every read but its
 *  history (and its slots' rows) survives. */
export async function deleteWorkloadAssignment(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/workload-assignments/${id}`, { method: 'DELETE' });
}

export interface UpdateWorkloadAssignmentInput {
  color?: string | null;
  subject_id?: string;
  section_id?: string;
}

export function updateWorkloadAssignment(
  id: string,
  input: UpdateWorkloadAssignmentInput,
): Promise<{ assignment: WorkloadAssignment }> {
  return apiFetch<{ assignment: WorkloadAssignment }>(`/api/workload-assignments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}