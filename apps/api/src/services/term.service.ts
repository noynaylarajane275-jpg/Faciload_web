import type { AcademicTerm } from '@prisma/client';
import type { Semester } from '../types/domain.js';
import { z } from 'zod';
import { ApiError } from '../errors/apiError.js';
import * as termRepository from '../repositories/term.repository.js';
import {
  createTermSchema,
  updateTermSchema,
  type CreateTermInput,
  type UpdateTermInput,
} from '../validation/term.validation.js';

export interface TermDto {
  id: string;
  school_year: string;
  semester: Semester;
  is_active: boolean;
  /** Display label for the header Term selector ("2026-2027 — 1st Sem"). */
  label: string;
  created_at: string;
}

export interface TermListDto {
  data: TermDto[];
  meta: { total: number };
}

const SEMESTER_LABELS: Record<Semester, string> = {
  FIRST: '1st Sem',
  SECOND: '2nd Sem',
  SUMMER: 'Summer',
};

function parseOrBadRequest<T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid request', parsed.error.flatten());
  }
  return parsed.data as z.infer<T>;
}

export function toTermDto(term: AcademicTerm): TermDto {
  return {
    id: term.id,
    school_year: term.school_year,
    semester: term.semester as Semester, // validated on write (z.enum); stored as a plain string
    is_active: term.is_active,
    label: `${term.school_year} — ${SEMESTER_LABELS[term.semester as Semester]}`,
    created_at: term.created_at.toISOString(),
  };
}

export async function listTerms(): Promise<TermListDto> {
  const rows = await termRepository.list();
  return { data: rows.map(toTermDto), meta: { total: rows.length } };
}

/**
 * The single active term. Returns `{ term: null }` (200, not 404) when none is
 * active yet: the Schedule page and the header selector both treat "no active
 * term" as a normal empty state rather than an error.
 */
export async function getActiveTerm(): Promise<{ term: TermDto | null }> {
  const term = await termRepository.findActive();
  return { term: term ? toTermDto(term) : null };
}

async function assertUnique(
  schoolYear: string,
  semester: Semester,
  excludeId?: string,
): Promise<void> {
  const existing = await termRepository.findBySchoolYearAndSemester(schoolYear, semester, excludeId);
  if (existing) {
    throw ApiError.conflict(
      'TERM_DUPLICATE',
      `${existing.school_year} ${existing.semester} already exists`,
      { field: 'school_year', school_year: existing.school_year, semester: existing.semester },
    );
  }
}

export async function createTerm(rawBody: unknown): Promise<TermDto> {
  const input: CreateTermInput = parseOrBadRequest(createTermSchema, rawBody);
  await assertUnique(input.school_year, input.semester);
  return toTermDto(await termRepository.create(input));
}

/**
 * Partial update; `{ is_active: true }` alone is the "make this the current
 * term" call made by the header selector. The repository transaction
 * deactivates whichever term was active before.
 */
export async function updateTerm(id: string, rawBody: unknown): Promise<TermDto> {
  const input: UpdateTermInput = parseOrBadRequest(updateTermSchema, rawBody);
  const existing = await termRepository.findById(id);
  if (!existing) {
    throw ApiError.notFound('Term not found');
  }
  const nextSchoolYear = input.school_year ?? existing.school_year;
  const nextSemester = input.semester ?? existing.semester;
  if (input.school_year !== undefined || input.semester !== undefined) {
    await assertUnique(nextSchoolYear, nextSemester as Semester, id);
  }
  return toTermDto(await termRepository.update(id, input));
}