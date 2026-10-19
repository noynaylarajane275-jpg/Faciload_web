import { Prisma, type Subject } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export type SubjectSortField = 'code' | 'title' | 'units' | 'created_at';
export type SortDirection = 'asc' | 'desc';

export interface SubjectListParams {
  search: string | null;
  page: number;
  pageSize: number;
  sortBy: SubjectSortField;
  sortDir: SortDirection;
}

export interface SubjectListResult {
  rows: Subject[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SubjectCreateData {
  code: string;
  title: string;
  units: number;
  lecture_hours: number;
  lab_hours: number;
}

export type SubjectUpdateData = Partial<SubjectCreateData>;

/**
 * Active-only scope: soft-deleted subjects are excluded from every lookup
 * here (database-specification.md Section 7). `code` carries a partial
 * unique index (applied via prisma/apply-checks.ts) so a soft-deleted
 * subject's code becomes reusable — findActiveByCode mirrors that scope so
 * duplicate checks ignore archived rows.
 */
function listWhere(search: string | null): Prisma.SubjectWhereInput {
  const trimmed = search?.trim();
  if (!trimmed) {
    return { deleted_at: null };
  }
  return {
    deleted_at: null,
    OR: [
      { code: { contains: trimmed } },
      { title: { contains: trimmed } },
    ],
  };
}

function orderByFor(
  sortBy: SubjectSortField,
  sortDir: SortDirection,
): Prisma.SubjectOrderByWithRelationInput[] {
  // Secondary code sort keeps pagination order stable for ties.
  switch (sortBy) {
    case 'title':
      return [{ title: sortDir }, { code: 'asc' }];
    case 'units':
      return [{ units: sortDir }, { code: 'asc' }];
    case 'created_at':
      return [{ created_at: sortDir }, { code: 'asc' }];
    case 'code':
    default:
      return [{ code: sortDir }];
  }
}

export async function list(params: SubjectListParams): Promise<SubjectListResult> {
  const where = listWhere(params.search);
  const [rows, total] = await prisma.$transaction([
    prisma.subject.findMany({
      where,
      orderBy: orderByFor(params.sortBy, params.sortDir),
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.subject.count({ where }),
  ]);
  return { rows, total, page: params.page, pageSize: params.pageSize };
}

export async function findActiveById(id: string): Promise<Subject | null> {
  return prisma.subject.findFirst({ where: { id, deleted_at: null } });
}

export async function findActiveByCode(
  code: string,
  excludeId?: string,
): Promise<{ id: string; code: string } | null> {
  // Case-insensitive compare in JS (see faculty.repository.findActiveByEmployeeNo:
  // SQLite has no `mode: 'insensitive'` filter). Active rows only, mirroring
  // the partial unique index scope.
  const candidates = await prisma.subject.findMany({
    where: { deleted_at: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, code: true },
  });
  const target = code.toLowerCase();
  return candidates.find((row) => row.code.toLowerCase() === target) ?? null;
}

export async function create(data: SubjectCreateData): Promise<Subject> {
  return prisma.subject.create({ data });
}

export async function update(id: string, data: SubjectUpdateData): Promise<Subject> {
  return prisma.subject.update({ where: { id }, data });
}

export async function softDelete(id: string): Promise<Subject> {
  return prisma.subject.update({ where: { id }, data: { deleted_at: new Date() } });
}