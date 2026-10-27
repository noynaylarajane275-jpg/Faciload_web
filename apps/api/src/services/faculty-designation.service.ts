import type { DesignationSession, FacultyDesignation } from '@prisma/client';
import { ApiError } from '../errors/apiError.js';
import * as designationRepository from '../repositories/faculty-designation.repository.js';
import {
  createDesignationSessionSchema,
  createFacultyDesignationSchema,
  facultyDesignationQuerySchema,
} from '../validation/faculty-designation.validation.js';
import { prisma } from '../config/prisma.js';
import { timeOfDayToMinutes } from '../utils/time.js';

type DesignationWithSessions = FacultyDesignation & { sessions: DesignationSession[] };

export interface DesignationSessionDto {
  id: string;
  designation_id: string;
  title: string;
  day_of_week: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI';
  start_time: string;
  end_time: string;
  created_at: string;
}

export interface FacultyDesignationDto {
  id: string;
  faculty_id: string;
  term_id: string;
  name: string;
  total_hours: number;
  sessions: DesignationSessionDto[];
  created_at: string;
}

function sessionDto(session: DesignationSession): DesignationSessionDto {
  return {
    id: session.id,
    designation_id: session.designation_id,
    title: session.title,
    day_of_week: session.day_of_week as DesignationSessionDto['day_of_week'],
    start_time: session.start_time,
    end_time: session.end_time,
    created_at: session.created_at.toISOString(),
  };
}

function designationDto(designation: DesignationWithSessions): FacultyDesignationDto {
  const sessions = designation.sessions.map(sessionDto);
  const totalMinutes = designation.sessions.reduce(
    (sum, session) =>
      sum + timeOfDayToMinutes(session.end_time) - timeOfDayToMinutes(session.start_time),
    0,
  );
  return {
    id: designation.id,
    faculty_id: designation.faculty_id,
    term_id: designation.term_id,
    name: designation.name,
    total_hours: Math.round((totalMinutes / 60) * 100) / 100,
    sessions,
    created_at: designation.created_at.toISOString(),
  };
}

export async function listFacultyDesignations(
  rawQuery: unknown,
  role: string,
  linkedFacultyId: string | null,
): Promise<{ data: FacultyDesignationDto[] }> {
  const parsed = facultyDesignationQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid designation query', parsed.error.flatten());
  }
  const facultyId = role === 'FACULTY' ? linkedFacultyId : parsed.data.facultyId;
  if (!facultyId) {
    throw ApiError.badRequest('Select an instructor to view designations');
  }
  const designations = await designationRepository.list(facultyId, parsed.data.termId);
  return { data: designations.map(designationDto) };
}

export async function createFacultyDesignation(
  rawBody: unknown,
): Promise<FacultyDesignationDto> {
  const parsed = createFacultyDesignationSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid designation', parsed.error.flatten());
  }
  const faculty = await prisma.faculty.findFirst({
    where: { id: parsed.data.faculty_id, deleted_at: null },
    select: { id: true },
  });
  if (!faculty) throw ApiError.notFound('Faculty profile not found');
  const term = await prisma.academicTerm.findUnique({
    where: { id: parsed.data.term_id },
    select: { id: true },
  });
  if (!term) throw ApiError.notFound('Academic term not found');

  const duplicate = await prisma.facultyDesignation.findFirst({
    where: {
      faculty_id: parsed.data.faculty_id,
      term_id: parsed.data.term_id,
      name: { equals: parsed.data.name },
    },
    select: { id: true },
  });
  if (duplicate) {
    throw ApiError.conflict('DESIGNATION_DUPLICATE', 'This faculty member already has that designation for the selected term.');
  }
  const designation = await designationRepository.create(parsed.data);
  return designationDto({ ...designation, sessions: [] });
}

export async function createDesignationSession(
  rawBody: unknown,
  facultyId: string | null,
): Promise<DesignationSessionDto> {
  if (!facultyId) {
    throw ApiError.badRequest('Your account is not linked to a faculty profile');
  }
  const parsed = createDesignationSessionSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid designation session', parsed.error.flatten());
  }
  const designation = await designationRepository.findById(parsed.data.designation_id);
  if (!designation || designation.faculty_id !== facultyId) {
    throw ApiError.notFound('Assigned designation not found');
  }
  const conflict = await designationRepository.findScheduleConflict(
    facultyId,
    designation.term_id,
    parsed.data.day_of_week,
    parsed.data.start_time.slice(0, 5),
    parsed.data.end_time.slice(0, 5),
  );
  if (conflict) {
    throw ApiError.conflict(
      'DESIGNATION_SESSION_CONFLICT',
      'This time overlaps a class, other function, or designation session for this instructor.',
    );
  }
  const created = await designationRepository.createSession({
    ...parsed.data,
    title: designation.name,
  });
  return sessionDto(created);
}

export async function deleteFacultyDesignation(id: string): Promise<void> {
  if (!(await designationRepository.removeDesignation(id))) {
    throw ApiError.notFound('Designation not found');
  }
}

export async function deleteDesignationSession(
  id: string,
  facultyId: string | null,
): Promise<void> {
  if (!facultyId) {
    throw ApiError.badRequest('Your account is not linked to a faculty profile');
  }
  if (!(await designationRepository.removeSession(id, facultyId))) {
    throw ApiError.notFound('Designation session not found');
  }
}
