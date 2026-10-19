import type { Subject } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '../errors/apiError.js';
import * as subjectRepository from '../repositories/subject.repository.js';
import type {
  SortDirection,
  SubjectListParams,
  SubjectSortField,
} from '../repositories/subject.repository.js';
import {
  createSubjectSchema,
  subjectQuerySchema,
  updateSubjectSchema,
  type CreateSubjectInput,
  type UpdateSubjectInput,
} from '../validation/subject.validation.js';

export interface SubjectDto {
  id: string;
  code: string;
  title: string;
  units: number;
  lecture_hours: number;
  lab_hours: number;
  created_at: string;
  updated_at: string;
}

export interface SubjectListDto {
  data: SubjectDto[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
  };
}

/** Central validation entry point: bad input becomes a 400 ApiError. */
function parseOrBadRequest<T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid request', parsed.error.flatten());
  }
  return parsed.data as z.infer<T>;
}

function toNumber(value: Subject['units']): number {
  return Number(value);
}

/** Floats serialize as plain numbers (SQLite dropped the Decimal columns). */
export function toSubjectDto(subject: Subject): SubjectDto {
  return {
    id: subject.id,
    code: subject.code,
    title: subject.title,
    units: toNumber(subject.units),
    lecture_hours: toNumber(subject.lecture_hours),
    lab_hours: toNumber(subject.lab_hours),
    created_at: subject.created_at.toISOString(),
    updated_at: subject.updated_at.toISOString(),
  };
}

export async function listSubjects(rawQuery: unknown): Promise<SubjectListDto> {
  const query = parseOrBadRequest(subjectQuerySchema, rawQuery);
  const params: SubjectListParams = {
    search: query.search ?? null,
    page: query.page,
    pageSize: query.pageSize,
    sortBy: (query.sortBy ?? 'code') as SubjectSortField,
    sortDir: (query.sortDir ?? 'asc') as SortDirection,
  };
  const result = await subjectRepository.list(params);
  return {
    data: result.rows.map(toSubjectDto),
    meta: {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      pageCount: Math.max(1, Math.ceil(result.total / result.pageSize)),
    },
  };
}

export async function getSubject(id: string): Promise<SubjectDto> {
  const subject = await subjectRepository.findActiveById(id);
  if (!subject) {
    throw ApiError.notFound('Subject not found');
  }
  return toSubjectDto(subject);
}

/**
 * Service-level duplicate guard (case-insensitive) so the client gets a
 * clean 409 with field details instead of a raw DB P2002 error. Checks all
 * rows: a soft-deleted subject's code stays reserved by the DB-level unique
 * index on code.
 */
async function assertCodeAvailable(code: string, excludeId?: string): Promise<void> {
  const existing = await subjectRepository.findActiveByCode(code, excludeId);
  if (existing) {
    throw ApiError.conflict(
      'SUBJECT_DUPLICATE_CODE',
      `Subject code "${existing.code}" is already in use`,
      { field: 'code', code: existing.code },
    );
  }
}

export async function createSubject(rawBody: unknown): Promise<SubjectDto> {
  const input: CreateSubjectInput = parseOrBadRequest(createSubjectSchema, rawBody);
  await assertCodeAvailable(input.code);
  const subject = await subjectRepository.create(input);
  return toSubjectDto(subject);
}

export async function updateSubject(id: string, rawBody: unknown): Promise<SubjectDto> {
  const input: UpdateSubjectInput = parseOrBadRequest(updateSubjectSchema, rawBody);
  const existing = await subjectRepository.findActiveById(id);
  if (!existing) {
    throw ApiError.notFound('Subject not found');
  }
  if (input.code !== undefined && input.code.toLowerCase() !== existing.code.toLowerCase()) {
    await assertCodeAvailable(input.code, id);
  }
  const updated = await subjectRepository.update(id, input);
  return toSubjectDto(updated);
}

export async function deleteSubject(id: string): Promise<void> {
  const existing = await subjectRepository.findActiveById(id);
  if (!existing) {
    throw ApiError.notFound('Subject not found');
  }
  await subjectRepository.softDelete(id);
}