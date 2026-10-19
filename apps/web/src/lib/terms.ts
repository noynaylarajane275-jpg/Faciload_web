import { apiFetch } from './api';

export type Semester = 'FIRST' | 'SECOND' | 'SUMMER';

export interface Term {
  id: string;
  school_year: string;
  semester: Semester;
  is_active: boolean;
  /** "2026-2027 — 1st Sem" — the label shown in the header Term selector. */
  label: string;
  created_at: string;
}

export interface TermListResult {
  data: Term[];
  meta: { total: number };
}

export function listTerms(): Promise<TermListResult> {
  return apiFetch<TermListResult>('/api/terms');
}

/** `term` is null when no term is active yet — a normal empty state, not a 404. */
export function getActiveTerm(): Promise<{ term: Term | null }> {
  return apiFetch<{ term: Term | null }>('/api/terms/active');
}

export function createTerm(input: {
  school_year: string;
  semester: Semester;
  is_active?: boolean;
}): Promise<{ term: Term }> {
  return apiFetch<{ term: Term }>('/api/terms', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** `{ is_active: true }` alone makes this the current term; the API flips any
 *  previously active term off in the same transaction. */
export function updateTerm(
  id: string,
  input: Partial<{ school_year: string; semester: Semester; is_active: boolean }>,
): Promise<{ term: Term }> {
  return apiFetch<{ term: Term }>(`/api/terms/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}