import { Prisma, type Room } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export interface RoomCreateData {
  name: string;
  is_under_maintenance: boolean;
}

export type RoomUpdateData = Partial<RoomCreateData>;

/** Rooms have no soft delete (database-specification.md: restrict-on-reference),
 *  so every lookup here is naturally scoped to live rows. */
function listWhere(search: string | null): Prisma.RoomWhereInput {
  const trimmed = search?.trim();
  if (!trimmed) {
    return {};
  }
  return { name: { contains: trimmed } };
}

export async function list(search: string | null): Promise<Room[]> {
  return prisma.room.findMany({ where: listWhere(search), orderBy: [{ name: 'asc' }] });
}

export async function findById(id: string): Promise<Room | null> {
  return prisma.room.findUnique({ where: { id } });
}

export async function findByName(name: string, excludeId?: string): Promise<Room | null> {
  // Case-insensitive compare in JS (see faculty.repository.findActiveByEmployeeNo:
  // SQLite has no `mode: 'insensitive'` filter). Rooms have no soft delete.
  const candidates = await prisma.room.findMany({
    where: excludeId ? { id: { not: excludeId } } : {},
  });
  const target = name.toLowerCase();
  return candidates.find((room) => room.name.toLowerCase() === target) ?? null;
}

export async function create(data: RoomCreateData): Promise<Room> {
  return prisma.room.create({ data });
}

export async function update(id: string, data: RoomUpdateData): Promise<Room> {
  return prisma.room.update({ where: { id }, data });
}