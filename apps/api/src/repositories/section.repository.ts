import { Prisma, type Section } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export interface SectionListParams {
  search: string | null;
  yearLevel: number | null;
}

export interface SectionCreateData {
  year_level: number;
  name: string;
}

export type SectionUpdateData = Partial<SectionCreateData>;

/** Sections have no soft delete; every lookup is naturally live-row scoped. */
function listWhere(params: SectionListParams): Prisma.SectionWhereInput {
  const trimmed = params.search?.trim();
  return {
    ...(trimmed ? { name: { contains: trimmed } } : {}),
    ...(params.yearLevel !== null ? { year_level: params.yearLevel } : {}),
  };
}

export async function list(params: SectionListParams): Promise<Section[]> {
  return prisma.section.findMany({
    where: listWhere(params),
    orderBy: [{ year_level: 'asc' }, { name: 'asc' }],
  });
}

export async function findById(id: string): Promise<Section | null> {
  return prisma.section.findUnique({ where: { id } });
}

/** Mirrors the DB unique constraint Section(year_level, name). */
export async function findByYearLevelAndName(
  yearLevel: number,
  name: string,
  excludeId?: string,
): Promise<Section | null> {
  // Case-insensitive name compare in JS (see faculty.repository — SQLite has
  // no `mode: 'insensitive'` filter); year_level matches exactly.
  const candidates = await prisma.section.findMany({
    where: { year_level: yearLevel, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
  const target = name.toLowerCase();
  return candidates.find((section) => section.name.toLowerCase() === target) ?? null;
}

export async function create(data: SectionCreateData): Promise<Section> {
  return prisma.section.create({ data });
}

export async function update(id: string, data: SectionUpdateData): Promise<Section> {
  return prisma.section.update({ where: { id }, data });
}

export async function remove(id: string): Promise<Section> {
  return prisma.section.delete({ where: { id } });
}

/** True when any WorkloadAssignment still references the section — the DB
 *  restricts the delete, but a pre-check yields a friendlier 409. */
export async function hasAssignments(id: string): Promise<boolean> {
  const count = await prisma.workloadAssignment.count({ where: { section_id: id, deleted_at: null } });
  return count > 0;
}