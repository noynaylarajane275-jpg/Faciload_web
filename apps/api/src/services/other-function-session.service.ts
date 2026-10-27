import type { OtherFunctionSession } from '@prisma/client';
import { ApiError } from '../errors/apiError.js';
import * as otherFunctionSessionRepository from '../repositories/other-function-session.repository.js';
import {
  createOtherFunctionSessionSchema,
  otherFunctionSessionQuerySchema,
} from '../validation/other-function-session.validation.js';
import { prisma } from '../config/prisma.js';

export interface OtherFunctionSessionDto {
  id: string;
  faculty_id: string;
  term_id: string;
  function_type: 'RESEARCH' | 'EXTENSION' | 'IMP' | 'CONSULTATION';
  title: string;
  day_of_week: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI';
  start_time: string;
  end_time: string;
  created_at: string;
}

const FUNCTION_TYPE_LABELS = {
  RESEARCH: 'Research',
  EXTENSION: 'Extension',
  IMP: 'IMP',
  CONSULTATION: 'Consultation',
} as const;

function toDto(session: OtherFunctionSession): OtherFunctionSessionDto {
  return {
    id: session.id,
    faculty_id: session.faculty_id,
    term_id: session.term_id,
    function_type: session.function_type as OtherFunctionSessionDto['function_type'],
    title: session.title,
    day_of_week: session.day_of_week as OtherFunctionSessionDto['day_of_week'],
    start_time: session.start_time,
    end_time: session.end_time,
    created_at: session.created_at.toISOString(),
  };
}

export async function listOtherFunctionSessions(
  rawQuery: unknown,
  role: string,
  linkedFacultyId: string | null,
): Promise<{ data: OtherFunctionSessionDto[] }> {
  const parsed = otherFunctionSessionQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid other function session query', parsed.error.flatten());
  }
  const facultyId = role === 'FACULTY' ? linkedFacultyId : parsed.data.facultyId;
  if (!facultyId) {
    throw ApiError.badRequest('Select an instructor to view other function sessions');
  }
  const rows = await otherFunctionSessionRepository.list(parsed.data.termId, facultyId);
  const dayOrder = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  rows.sort(
    (a, b) =>
      dayOrder.indexOf(a.day_of_week) - dayOrder.indexOf(b.day_of_week) ||
      a.start_time.localeCompare(b.start_time),
  );
  return { data: rows.map(toDto) };
}

export async function createOtherFunctionSession(
  rawBody: unknown,
  facultyId: string | null,
): Promise<OtherFunctionSessionDto> {
  if (!facultyId) {
    throw ApiError.badRequest('Your account is not linked to a faculty profile');
  }
  const parsed = createOtherFunctionSessionSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid other function session', parsed.error.flatten());
  }
  const faculty = await prisma.faculty.findFirst({
    where: { id: facultyId, deleted_at: null },
    select: { id: true },
  });
  if (!faculty) {
    throw ApiError.notFound('Faculty profile not found');
  }
  const term = await prisma.academicTerm.findUnique({
    where: { id: parsed.data.term_id },
    select: { id: true },
  });
  if (!term) {
    throw ApiError.notFound('Academic term not found');
  }
  const conflict = await otherFunctionSessionRepository.findScheduleConflict(
    facultyId,
    parsed.data.term_id,
    parsed.data.day_of_week,
    parsed.data.start_time.slice(0, 5),
    parsed.data.end_time.slice(0, 5),
  );
  if (conflict) {
    throw ApiError.conflict(
      'OTHER_FUNCTION_CONFLICT',
      'This time overlaps another class or other function session for this instructor.',
    );
  }
  const session = await otherFunctionSessionRepository.create(facultyId, {
    ...parsed.data,
    title: FUNCTION_TYPE_LABELS[parsed.data.function_type],
  });
  return toDto(session);
}

export async function deleteOtherFunctionSession(
  id: string,
  facultyId: string | null,
): Promise<void> {
  if (!facultyId) {
    throw ApiError.badRequest('Your account is not linked to a faculty profile');
  }
  if (!(await otherFunctionSessionRepository.remove(id, facultyId))) {
    throw ApiError.notFound('Other function session not found');
  }
}
