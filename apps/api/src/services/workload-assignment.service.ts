import { z } from 'zod';
import { ApiError } from '../errors/apiError.js';
import { timeOfDayToMinutes } from '../utils/time.js';
import * as facultyRepository from '../repositories/faculty.repository.js';
import * as sectionRepository from '../repositories/section.repository.js';
import * as subjectRepository from '../repositories/subject.repository.js';
import * as termRepository from '../repositories/term.repository.js';
import * as workloadAssignmentRepository from '../repositories/workload-assignment.repository.js';
import type { WorkloadAssignmentWithRelations } from '../repositories/workload-assignment.repository.js';
import { sortSlotsByDay } from '../repositories/schedule-slot.repository.js';
import { toScheduleSlotDto, type ScheduleSlotDto } from './schedule-slot.service.js';
import {
  createWorkloadAssignmentSchema,
  updateWorkloadAssignmentSchema,
  workloadAssignmentQuerySchema,
  type CreateWorkloadAssignmentInput,
  type UpdateWorkloadAssignmentInput,
} from '../validation/workload-assignment.validation.js';

export interface WorkloadAssignmentDto {
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
  /** Subject's budgeted weekly LECTURE hours (source of the LECTURE cards). */
  lecture_hours: number;
  /** Subject's budgeted weekly LAB hours (source of the LAB cards). */
  lab_hours: number;
  /** Lecture + lab hours the subject expects for the week. */
  weekly_hours: number;
  /** Already placed, summed across both session types. */
  scheduled_hours: number;
  remaining_hours: number;
  /** Already placed LECTURE slots, in hours. */
  scheduled_lecture_hours: number;
  /** LECTURE hours still placeable: the subject's `lecture_hours` minus placed. */
  remaining_lecture_hours: number;
  /** Already placed LAB slots, in hours. */
  scheduled_lab_hours: number;
  /** LAB hours still placeable: the subject's `lab_hours` minus placed. */
  remaining_lab_hours: number;
  /** Custom color for the assignment's cards and placed blocks (hex or null). */
  color: string | null;
  slots: ScheduleSlotDto[];
  created_at: string;
}

export interface WorkloadAssignmentListDto {
  data: WorkloadAssignmentDto[];
  meta: { total: number; page: number; pageSize: number; pageCount: number };
}

// Indexed by the stored semester string (the schema field was a Prisma enum
// before the SQLite migration).
const SEMESTER_LABELS: Record<string, string> = {
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Weekly hours the assignment must occupy. Subject hours are authoritative
 * (Float columns — plain numbers); 0-hour catalog rows fall back to units so
 * a drag always has a sensible block length.
 */
export function weeklyHoursOf(assignment: WorkloadAssignmentWithRelations): number {
  const lecture = Number(assignment.subject.lecture_hours);
  const lab = Number(assignment.subject.lab_hours);
  const total = lecture + lab;
  if (total > 0) {
    return round2(total);
  }
  const units = Number(assignment.subject.units);
  return units > 0 ? round2(units) : 1;
}

export function toWorkloadAssignmentDto(
  assignment: WorkloadAssignmentWithRelations,
): WorkloadAssignmentDto {
  const weeklyHours = weeklyHoursOf(assignment);
  const lectureHours = round2(
    assignment.subject.lecture_hours ? Number(assignment.subject.lecture_hours) : 0,
  );
  const labHours = round2(
    assignment.subject.lab_hours ? Number(assignment.subject.lab_hours) : 0,
  );
  let scheduledHours = 0;
  let scheduledLectureHours = 0;
  let scheduledLabHours = 0;
  for (const slot of assignment.slots) {
    const slotHours = (timeOfDayToMinutes(slot.end_time) - timeOfDayToMinutes(slot.start_time)) / 60;
    const hours = round2(slotHours);
    scheduledHours = round2(scheduledHours + hours);
    if (slot.session_type === 'LECTURE') {
      scheduledLectureHours = round2(scheduledLectureHours + hours);
    } else {
      scheduledLabHours = round2(scheduledLabHours + hours);
    }
  }
  return {
    id: assignment.id,
    faculty_id: assignment.faculty_id,
    subject_id: assignment.subject_id,
    section_id: assignment.section_id,
    term_id: assignment.term_id,
    faculty_name: `${assignment.faculty.first_name} ${assignment.faculty.last_name}`,
    subject_code: assignment.subject.code,
    subject_title: assignment.subject.title,
    subject_units: Number(assignment.subject.units),
    section_label: `${assignment.section.name} (Year ${assignment.section.year_level})`,
    term_label: `${assignment.term.school_year} — ${SEMESTER_LABELS[assignment.term.semester]}`,
    lecture_hours: lectureHours,
    lab_hours: labHours,
    weekly_hours: weeklyHours,
    scheduled_hours: scheduledHours,
    remaining_hours: Math.max(0, round2(weeklyHours - scheduledHours)),
    scheduled_lecture_hours: scheduledLectureHours,
    remaining_lecture_hours: Math.max(0, lectureHours - scheduledLectureHours),
    scheduled_lab_hours: scheduledLabHours,
    remaining_lab_hours: Math.max(0, labHours - scheduledLabHours),
    color: assignment.color ?? null,
    slots: sortSlotsByDay(assignment.slots).map(toScheduleSlotDto),
    created_at: assignment.created_at.toISOString(),
  };
}

export async function listWorkloadAssignments(
  rawQuery: unknown,
): Promise<WorkloadAssignmentListDto> {
  const query = parseOrBadRequest(workloadAssignmentQuerySchema, rawQuery);
  const result = await workloadAssignmentRepository.list(
    {
      termId: query.termId ?? null,
      facultyId: query.facultyId ?? null,
      sectionId: query.sectionId ?? null,
      subjectId: query.subjectId ?? null,
      search: query.search ?? null,
    },
    { page: query.page ?? null, pageSize: query.pageSize ?? null },
  );
  return {
    data: result.rows.map(toWorkloadAssignmentDto),
    meta: {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      pageCount: Math.max(1, Math.ceil(result.total / result.pageSize)),
    },
  };
}

export async function getWorkloadAssignment(id: string): Promise<WorkloadAssignmentDto> {
  const assignment = await workloadAssignmentRepository.findActiveById(id);
  if (!assignment) {
    throw ApiError.notFound('Workload assignment not found');
  }
  return toWorkloadAssignmentDto(assignment);
}

/**
 * Referenced rows must exist (and still be live) before the assignment is
 * created; a missing reference is a 400 carrying the offending field so the
 * client can highlight it instead of showing a raw FK error.
 */
async function assertReferencesExist(input: CreateWorkloadAssignmentInput): Promise<void> {
  const [faculty, subject, section, term] = await Promise.all([
    facultyRepository.findActiveById(input.faculty_id),
    subjectRepository.findActiveById(input.subject_id),
    sectionRepository.findById(input.section_id),
    termRepository.findById(input.term_id),
  ]);
  if (!faculty) {
    throw ApiError.badRequest('Unknown faculty_id', { field: 'faculty_id' });
  }
  if (!subject) {
    throw ApiError.badRequest('Unknown subject_id', { field: 'subject_id' });
  }
  if (!section) {
    throw ApiError.badRequest('Unknown section_id', { field: 'section_id' });
  }
  if (!term) {
    throw ApiError.badRequest('Unknown term_id', { field: 'term_id' });
  }
}

/**
 * Duplicates are rejected with a clear 409 up front (rather than surfacing the
 * DB's P2002) so the Schedule sidebar's quick-assign form can say exactly
 * which assignment already exists.
 */
export async function createWorkloadAssignment(rawBody: unknown): Promise<WorkloadAssignmentDto> {
  const input: CreateWorkloadAssignmentInput = parseOrBadRequest(
    createWorkloadAssignmentSchema,
    rawBody,
  );
  await assertReferencesExist(input);

  const duplicate = await workloadAssignmentRepository.findDuplicate(input);
  if (duplicate) {
    const [faculty, subject, section] = await Promise.all([
      facultyRepository.findActiveById(input.faculty_id),
      subjectRepository.findActiveById(input.subject_id),
      sectionRepository.findById(input.section_id),
    ]);
    const label = `${faculty?.first_name ?? ''} ${faculty?.last_name ?? ''}`.trim();
    throw ApiError.conflict(
      'WORKLOAD_ASSIGNMENT_DUPLICATE',
      `${subject?.code ?? 'This subject'} is already assigned to ${
        label || 'this faculty member'
      } for ${section?.name ?? 'this section'} this term`,
      {
        field: 'faculty_id',
        faculty_id: input.faculty_id,
        subject_id: input.subject_id,
        section_id: input.section_id,
        term_id: input.term_id,
        existing_id: duplicate.id,
      },
    );
  }

  return toWorkloadAssignmentDto(await workloadAssignmentRepository.create(input));
}

/**
 * Soft delete (database-specification.md §7: preserves historical workload
 * records). The assignment's ScheduleSlot rows stay in place but stop being
 * returned, because every slot read joins through
 * `workload_assignment.deleted_at IS NULL`.
 */
export async function deleteWorkloadAssignment(id: string): Promise<void> {
  const existing = await workloadAssignmentRepository.findActiveById(id);
  if (!existing) {
    throw ApiError.notFound('Workload assignment not found');
  }
  const slotCount = await workloadAssignmentRepository.countSlots(id);
  if (slotCount > 0) {
    throw ApiError.conflict(
      'WORKLOAD_ASSIGNMENT_HAS_SLOTS',
      'This assignment has scheduled classes — remove those from the Schedule first',
      { field: 'scheduleSlots', count: slotCount },
    );
  }
  await workloadAssignmentRepository.softDelete(id);
}

export async function updateWorkloadAssignment(
  id: string,
  rawBody: unknown,
): Promise<WorkloadAssignmentDto> {
  const input: UpdateWorkloadAssignmentInput = parseOrBadRequest(
    updateWorkloadAssignmentSchema,
    rawBody,
  );
  const existing = await workloadAssignmentRepository.findActiveById(id);
  if (!existing) {
    throw ApiError.notFound('Workload assignment not found');
  }
  const nextSubjectId = input.subject_id ?? existing.subject_id;
  const nextSectionId = input.section_id ?? existing.section_id;
  if (nextSubjectId !== existing.subject_id) {
    const subject = await subjectRepository.findActiveById(nextSubjectId);
    if (!subject) {
      throw ApiError.badRequest('Unknown subject_id', { field: 'subject_id' });
    }
  }
  if (nextSectionId !== existing.section_id) {
    const section = await sectionRepository.findById(nextSectionId);
    if (!section) {
      throw ApiError.badRequest('Unknown section_id', { field: 'section_id' });
    }
  }
  if (nextSubjectId !== existing.subject_id || nextSectionId !== existing.section_id) {
    const duplicate = await workloadAssignmentRepository.findDuplicate({
      faculty_id: existing.faculty_id,
      subject_id: nextSubjectId,
      section_id: nextSectionId,
      term_id: existing.term_id,
    });
    if (duplicate && duplicate.id !== existing.id) {
      throw ApiError.conflict(
        'WORKLOAD_ASSIGNMENT_DUPLICATE',
        'This subject is already assigned to this faculty member for this section this term',
        { field: 'subject_id', existing_id: duplicate.id },
      );
    }
  }
  const updated = await workloadAssignmentRepository.update(id, {
    ...(input.subject_id !== undefined ? { subject_id: input.subject_id } : {}),
    ...(input.section_id !== undefined ? { section_id: input.section_id } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
  });
  return toWorkloadAssignmentDto(updated);
}