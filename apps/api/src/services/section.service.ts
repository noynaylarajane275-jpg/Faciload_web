import type { Section } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '../errors/apiError.js';
import * as sectionRepository from '../repositories/section.repository.js';
import {
  createSectionSchema,
  sectionQuerySchema,
  updateSectionSchema,
  type CreateSectionInput,
  type UpdateSectionInput,
} from '../validation/section.validation.js';

export interface SectionDto {
  id: string;
  year_level: number;
  name: string;
  /** Convenience label ("1A — Year 1") used by every section dropdown. */
  label: string;
  created_at: string;
  updated_at: string;
}

export interface SectionListDto {
  data: SectionDto[];
  meta: { total: number };
}

function parseOrBadRequest<T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid request', parsed.error.flatten());
  }
  return parsed.data as z.infer<T>;
}

export function toSectionDto(section: Section): SectionDto {
  return {
    id: section.id,
    year_level: section.year_level,
    name: section.name,
    label: `${section.name} (Year ${section.year_level})`,
    created_at: section.created_at.toISOString(),
    updated_at: section.updated_at.toISOString(),
  };
}

export async function listSections(rawQuery: unknown): Promise<SectionListDto> {
  const query = parseOrBadRequest(sectionQuerySchema, rawQuery);
  const rows = await sectionRepository.list({
    search: query.search ?? null,
    yearLevel: query.year_level ?? null,
  });
  return { data: rows.map(toSectionDto), meta: { total: rows.length } };
}

export async function getSection(id: string): Promise<SectionDto> {
  const section = await sectionRepository.findById(id);
  if (!section) {
    throw ApiError.notFound('Section not found');
  }
  return toSectionDto(section);
}

/** Mirrors the DB unique constraint Section(year_level, name). */
async function assertUnique(yearLevel: number, name: string, excludeId?: string): Promise<void> {
  const existing = await sectionRepository.findByYearLevelAndName(yearLevel, name, excludeId);
  if (existing) {
    throw ApiError.conflict(
      'SECTION_DUPLICATE',
      `Section "${existing.name}" already exists for year ${existing.year_level}`,
      { field: 'name', name: existing.name, year_level: existing.year_level },
    );
  }
}

export async function createSection(rawBody: unknown): Promise<SectionDto> {
  const input: CreateSectionInput = parseOrBadRequest(createSectionSchema, rawBody);
  await assertUnique(input.year_level, input.name);
  return toSectionDto(await sectionRepository.create(input));
}

export async function updateSection(id: string, rawBody: unknown): Promise<SectionDto> {
  const input: UpdateSectionInput = parseOrBadRequest(updateSectionSchema, rawBody);
  const existing = await sectionRepository.findById(id);
  if (!existing) {
    throw ApiError.notFound('Section not found');
  }
  // Only re-check uniqueness when one of the two unique columns changes.
  const nextYearLevel = input.year_level ?? existing.year_level;
  const nextName = input.name ?? existing.name;
  if (
    input.year_level !== undefined ||
    (input.name !== undefined && input.name.toLowerCase() !== existing.name.toLowerCase())
  ) {
    await assertUnique(nextYearLevel, nextName, id);
  }
  return toSectionDto(await sectionRepository.update(id, input));
}

export async function deleteSection(id: string): Promise<void> {
  const existing = await sectionRepository.findById(id);
  if (!existing) {
    throw ApiError.notFound('Section not found');
  }
  if (await sectionRepository.hasAssignments(id)) {
    throw ApiError.conflict(
      'SECTION_IN_USE',
      'This section still has workload assignments. Remove them before deleting the section.',
      { field: 'section_id', section_id: id },
    );
  }
  await sectionRepository.remove(id);
}