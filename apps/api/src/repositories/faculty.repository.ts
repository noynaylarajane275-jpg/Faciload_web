import { Prisma, type Faculty } from '@prisma/client';
import { prisma } from '../config/prisma.js';
export type FacultySortField = 'employee_no' | 'last_name' | 'max_units' | 'created_at';
export type SortDirection = 'asc' | 'desc';

export interface FacultyListParams {
  search: string | null;
  page: number;
  pageSize: number;
  sortBy: FacultySortField;
  sortDir: SortDirection;
}

export interface FacultyListResult {
  rows: FacultyWithUser[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FacultyCreateData {
  employee_no: string;
  first_name: string;
  last_name: string;
  rank: string | null;
  employment_status: 'FULL_TIME' | 'PART_TIME';
  max_units: number;
}

export type FacultyUpdateData = Partial<FacultyCreateData>;

/** The user relation shape returned with every faculty row. */
export const facultyWithUserInclude = {
  user: {
    select: { id: true, email: true, role: true, is_active: true },
  },
} satisfies Prisma.FacultyInclude;

export type FacultyWithUser = Prisma.FacultyGetPayload<{ include: typeof facultyWithUserInclude }>;

function listWhere(search: string | null): Prisma.FacultyWhereInput {
  const trimmed = search?.trim();
  if (!trimmed) {
    return { deleted_at: null };
  }
  return {
    deleted_at: null,
    OR: [
      { employee_no: { contains: trimmed } },
      { first_name: { contains: trimmed } },
      { last_name: { contains: trimmed } },
    ],
  };
}

function orderByFor(
  sortBy: FacultySortField,
  sortDir: SortDirection,
): Prisma.FacultyOrderByWithRelationInput[] {
  switch (sortBy) {
    case 'last_name':
      return [{ last_name: sortDir }, { first_name: 'asc' }];
    case 'max_units':
      return [{ max_units: sortDir }, { employee_no: 'asc' }];
    case 'created_at':
      return [{ created_at: sortDir }, { employee_no: 'asc' }];
    case 'employee_no':
    default:
      return [{ employee_no: sortDir }];
  }
}

export async function list(params: FacultyListParams): Promise<FacultyListResult> {
  const where = listWhere(params.search);
  const [rows, total] = await prisma.$transaction([
    prisma.faculty.findMany({
      where,
      orderBy: orderByFor(params.sortBy, params.sortDir),
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: facultyWithUserInclude,
    }),
    prisma.faculty.count({ where }),
  ]);
  return { rows, total, page: params.page, pageSize: params.pageSize };
}

export async function findActiveById(id: string): Promise<Faculty | null> {
  return prisma.faculty.findFirst({ where: { id, deleted_at: null } });
}

export async function findActiveWithUserById(id: string): Promise<FacultyWithUser | null> {
  return prisma.faculty.findFirst({ where: { id, deleted_at: null }, include: facultyWithUserInclude });
}

export async function findActiveByEmployeeNo(
  employeeNo: string,
  excludeId?: string,
): Promise<{ id: string; employee_no: string } | null> {
  // Case-insensitive compare in JS: SQLite (local dev) has no
  // `mode: 'insensitive'` filter and PG/SQLite LIKE semantics differ —
  // faculty tables are department-scale, so scanning live rows is cheap.
  const candidates = await prisma.faculty.findMany({
    where: { deleted_at: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, employee_no: true },
  });
  const target = employeeNo.toLowerCase();
  return candidates.find((row) => row.employee_no.toLowerCase() === target) ?? null;
}

export async function create(data: FacultyCreateData): Promise<Faculty> {
  return prisma.faculty.create({ data });
}

export async function update(id: string, data: FacultyUpdateData): Promise<Faculty> {
  return prisma.faculty.update({ where: { id }, data });
}

/** Soft delete only (spec §7) — the row stays for historical workload data. */
export async function softDelete(id: string): Promise<Faculty> {
  return prisma.faculty.update({ where: { id }, data: { deleted_at: new Date() } });
}

/** Assignment count for a faculty member (FK-preservation check). */
export async function countAssignments(facultyId: string): Promise<number> {
  return prisma.workloadAssignment.count({ where: { faculty_id: facultyId } });
}

/**
 * Count of ACTIVE (non-soft-deleted) WorkloadAssignment rows — the data for
 * the faculty deletion guard: a person with active assignments is currently
 * scheduled and must not be removed.
 */
export async function countActiveAssignments(facultyId: string): Promise<number> {
  return prisma.workloadAssignment.count({
    where: { faculty_id: facultyId, deleted_at: null },
  });
}