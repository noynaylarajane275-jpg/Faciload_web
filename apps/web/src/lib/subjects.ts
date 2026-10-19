import { apiFetch } from './api';

export interface Subject {
  id: string;
  code: string;
  title: string;
  units: number;
  lecture_hours: number;
  lab_hours: number;
  created_at: string;
  updated_at: string;
}

export interface SubjectListMeta {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface SubjectListResult {
  data: Subject[];
  meta: SubjectListMeta;
}

export type SubjectSortBy = 'code' | 'title' | 'units' | 'created_at';
export type SubjectSortDir = 'asc' | 'desc';

export interface SubjectQuery {
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: SubjectSortBy;
  sortDir?: SubjectSortDir;
}

export interface SubjectInput {
  code: string;
  title: string;
  units: number;
  lecture_hours?: number;
  lab_hours?: number;
}

export function listSubjects(query: SubjectQuery = {}): Promise<SubjectListResult> {
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
  return apiFetch<SubjectListResult>(`/api/subjects${qs ? `?${qs}` : ''}`);
}

export function createSubject(input: SubjectInput): Promise<{ subject: Subject }> {
  return apiFetch<{ subject: Subject }>('/api/subjects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateSubject(id: string, input: Partial<SubjectInput>): Promise<{ subject: Subject }> {
  return apiFetch<{ subject: Subject }>(`/api/subjects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteSubject(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/subjects/${id}`, { method: 'DELETE' });
}