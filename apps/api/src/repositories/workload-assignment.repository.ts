import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { scheduleSlotInclude } from './schedule-slot.repository.js';

export interface WorkloadAssignmentListFilters {
  termId: string | null;
  facultyId: string | null;
  sectionId: string | null;
  subjectId: string | null;
  search: string | null;
}

export interface WorkloadAssignmentListPaging {
  page: number | null;
  pageSize: number | null;
}

export interface WorkloadAssignmentCreateData {
  faculty_id: string;
  subject_id: string;
  section_id: string;
  term_id: string;
}

/**
 * Nested rows every caller needs: the Schedule sidebar renders
 * "IE 322 — Operations Research 1 · BSCE 3A · Dela Cruz" and needs the
 * assignment's existing slots to know how much of it is still unscheduled.
 */
const assignmentInclude = {
  faculty: true,
  subject: true,
  section: true,
  term: true,
  slots: {
    include: scheduleSlotInclude,
    orderBy: [{ day_of_week: 'asc' }, { start_time: 'asc' }],
  },
} satisfies Prisma.WorkloadAssignmentInclude;

export type WorkloadAssignmentWithRelations = Prisma.WorkloadAssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;

/** Soft-deleted assignments are excluded from every read (database-spec §7). */
function listWhere(filters: WorkloadAssignmentListFilters): Prisma.WorkloadAssignmentWhereInput {
  const trimmed = filters.search?.trim();
  const searchOr: Prisma.WorkloadAssignmentWhereInput[] = trimmed
    ? [
        { faculty: { first_name: { contains: trimmed } } },
        { faculty: { last_name: { contains: trimmed } } },
        { faculty: { employee_no: { contains: trimmed } } },
        { subject: { code: { contains: trimmed } } },
        { subject: { title: { contains: trimmed } } },
        { section: { name: { contains: trimmed } } },
      ]
    : [];
  return {
    deleted_at: null,
    ...(filters.termId ? { term_id: filters.termId } : {}),
    ...(filters.facultyId ? { faculty_id: filters.facultyId } : {}),
    ...(filters.sectionId ? { section_id: filters.sectionId } : {}),
    ...(filters.subjectId ? { subject_id: filters.subjectId } : {}),
    ...(searchOr.length > 0 ? { OR: searchOr } : {}),
  };
}

export interface WorkloadAssignmentPage {
  rows: WorkloadAssignmentWithRelations[];
  total: number;
  page: number;
  pageSize: number;
}

export async function list(
  filters: WorkloadAssignmentListFilters,
  paging: WorkloadAssignmentListPaging = { page: null, pageSize: null },
): Promise<WorkloadAssignmentPage> {
  const where = listWhere(filters);
  // No paging params → legacy full-list behavior (Schedule sidebar).
  if (paging.page == null && paging.pageSize == null) {
    const rows = await prisma.workloadAssignment.findMany({
      where,
      include: assignmentInclude,
      orderBy: [{ created_at: 'asc' }],
    });
    return { rows, total: rows.length, page: 1, pageSize: rows.length === 0 ? 10 : rows.length };
  }
  const page = paging.page ?? 1;
  const pageSize = paging.pageSize ?? 10;
  const [rows, total] = await prisma.$transaction([
    prisma.workloadAssignment.findMany({
      where,
      include: assignmentInclude,
      orderBy: [{ created_at: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.workloadAssignment.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

export async function findActiveById(id: string): Promise<WorkloadAssignmentWithRelations | null> {
  return prisma.workloadAssignment.findFirst({
    where: { id, deleted_at: null },
    include: assignmentInclude,
  });
}

/** Mirrors the DB unique constraint (faculty_id, subject_id, section_id, term_id). */
export async function findDuplicate(
  data: WorkloadAssignmentCreateData,
): Promise<{ id: string } | null> {
  return prisma.workloadAssignment.findFirst({
    where: { ...data, deleted_at: null },
    select: { id: true },
  });
}

export async function create(
  data: WorkloadAssignmentCreateData,
): Promise<WorkloadAssignmentWithRelations> {
  return prisma.workloadAssignment.create({ data, include: assignmentInclude });
}

export async function softDelete(id: string): Promise<void> {
  await prisma.workloadAssignment.update({ where: { id }, data: { deleted_at: new Date() } });
}

export async function update(
  id: string,
  data: { color?: string | null; subject_id?: string; section_id?: string },
): Promise<WorkloadAssignmentWithRelations> {
  return prisma.workloadAssignment.update({
    where: { id },
    data,
    include: assignmentInclude,
  });
}

export async function countSlots(id: string): Promise<number> {
  return prisma.scheduleSlot.count({ where: { workload_assignment_id: id } });
}