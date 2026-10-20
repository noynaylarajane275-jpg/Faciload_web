import { apiFetch } from './api';

export interface Section {
  id: string;
  year_level: number;
  name: string;
  size: number;
  /** "1A (Year 1)" — ready-made dropdown label from the API. */
  label: string;
  created_at: string;
  updated_at: string;
}

export interface SectionListResult {
  data: Section[];
  meta: { total: number };
}

export interface SectionInput {
  year_level: number;
  name: string;
  size: number;
}

export function listSections(
  query: { search?: string; year_level?: number } = {},
): Promise<SectionListResult> {
  const params = new URLSearchParams();
  if (query.search) {
    params.set('search', query.search);
  }
  if (query.year_level !== undefined) {
    params.set('year_level', String(query.year_level));
  }
  const qs = params.toString();
  return apiFetch<SectionListResult>(`/api/sections${qs ? `?${qs}` : ''}`);
}

export function createSection(input: SectionInput): Promise<{ section: Section }> {
  return apiFetch<{ section: Section }>('/api/sections', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateSection(id: string, input: Partial<SectionInput>): Promise<{ section: Section }> {
  return apiFetch<{ section: Section }>(`/api/sections/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteSection(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/sections/${id}`, { method: 'DELETE' });
}