import { apiFetch } from './api';

export type EmploymentStatus = 'FULL_TIME' | 'PART_TIME';

export interface LinkedUser {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
}

export interface FacultyMember {
  id: string;
  employee_no: string;
  first_name: string;
  last_name: string;
  rank: string | null;
  employment_status: EmploymentStatus;
  max_units: number;
  created_at: string;
  updated_at: string;
  user: LinkedUser | null;
}

export interface FacultyListMeta {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface FacultyListResult {
  data: FacultyMember[];
  meta: FacultyListMeta;
}

export type FacultySortBy = 'employee_no' | 'last_name' | 'max_units' | 'created_at';
export type FacultySortDir = 'asc' | 'desc';

export interface FacultyQuery {
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: FacultySortBy;
  sortDir?: FacultySortDir;
}

export interface FacultyAccountInput {
  email: string;
  password: string;
}

export interface UnlinkedUser {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

export interface FacultyInput {
  employee_no: string;
  first_name: string;
  last_name: string;
  rank?: string | null;
  employment_status?: EmploymentStatus;
  max_units?: number;
  /** Opt-in: provision a linked FACULTY login so they can view their schedule. */
  account?: FacultyAccountInput;
  /** Alternative: link an already-registered (unlinked) user account. */
  existing_user_id?: string;
}

/** Response from POST /api/faculty — the created faculty plus its linked login. */
export interface CreateFacultyResult {
  faculty: FacultyMember;
}

export function listFaculty(query: FacultyQuery = {}): Promise<FacultyListResult> {
  const params = new URLSearchParams();
  if (query.search) {
    params.set('search', query.search);
  }
  if (query.page !== undefined) {
    params.set('page', String(query.page));
  }
  if (query.pageSize !== undefined) {
    params.set('pageSize', String(query.pageSize));
  }
  if (query.sortBy) {
    params.set('sortBy', query.sortBy);
  }
  if (query.sortDir) {
    params.set('sortDir', query.sortDir);
  }
  const qs = params.toString();
  return apiFetch<FacultyListResult>(`/api/faculty${qs ? `?${qs}` : ''}`);
}

export function createFaculty(input: FacultyInput): Promise<{ faculty: FacultyMember }> {
  return apiFetch<{ faculty: FacultyMember }>('/api/faculty', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateFaculty(
  id: string,
  input: Partial<FacultyInput>,
): Promise<{ faculty: FacultyMember }> {
  return apiFetch<{ faculty: FacultyMember }>(`/api/faculty/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteFaculty(id: string, confirmLinkedUser = false): Promise<void> {
  const qs = confirmLinkedUser ? '?confirmLinkedUser=true' : '';
  await apiFetch<unknown>(`/api/faculty/${id}${qs}`, { method: 'DELETE' });
}

/** Self-registered accounts waiting for a Chair to link them (CHAIR-only). */
export function listUnlinkedUsers(): Promise<{ users: UnlinkedUser[] }> {
  return apiFetch<{ users: UnlinkedUser[] }>('/api/faculty/unlinked-users');
}

/** Link a self-registered account to an existing faculty record (CHAIR-only). */
export function linkFacultyUser(id: string, existingUserId: string): Promise<{ faculty: FacultyMember }> {
  return apiFetch<{ faculty: FacultyMember }>(`/api/faculty/${id}/link-user`, {
    method: 'POST',
    body: JSON.stringify({ existing_user_id: existingUserId }),
  });
}
