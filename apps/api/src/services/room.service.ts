import type { Room } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '../errors/apiError.js';
import * as roomRepository from '../repositories/room.repository.js';
import {
  createRoomSchema,
  roomQuerySchema,
  updateRoomSchema,
  type CreateRoomInput,
  type UpdateRoomInput,
} from '../validation/room.validation.js';

export interface RoomDto {
  id: string;
  name: string;
  is_under_maintenance: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoomListDto {
  data: RoomDto[];
  meta: { total: number };
}

/** Central validation entry point: bad input becomes a 400 ApiError. */
function parseOrBadRequest<T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid request', parsed.error.flatten());
  }
  return parsed.data as z.infer<T>;
}

export function toRoomDto(room: Room): RoomDto {
  return {
    id: room.id,
    name: room.name,
    is_under_maintenance: room.is_under_maintenance,
    created_at: room.created_at.toISOString(),
    updated_at: room.updated_at.toISOString(),
  };
}

export async function listRooms(rawQuery: unknown): Promise<RoomListDto> {
  const query = parseOrBadRequest(roomQuerySchema, rawQuery);
  const rows = await roomRepository.list(query.search ?? null);
  return { data: rows.map(toRoomDto), meta: { total: rows.length } };
}

export async function getRoom(id: string): Promise<RoomDto> {
  const room = await roomRepository.findById(id);
  if (!room) {
    throw ApiError.notFound('Room not found');
  }
  return toRoomDto(room);
}

/** Service-level duplicate guard (case-insensitive) so the client gets a clean
 *  409 with field details instead of a raw DB P2002 error. */
async function assertNameAvailable(name: string, excludeId?: string): Promise<void> {
  const existing = await roomRepository.findByName(name, excludeId);
  if (existing) {
    throw ApiError.conflict('ROOM_DUPLICATE_NAME', `Room "${existing.name}" already exists`, {
      field: 'name',
      name: existing.name,
    });
  }
}

export async function createRoom(rawBody: unknown): Promise<RoomDto> {
  const input: CreateRoomInput = parseOrBadRequest(createRoomSchema, rawBody);
  await assertNameAvailable(input.name);
  return toRoomDto(await roomRepository.create(input));
}

/**
 * Partial update. A single-field body (`{ is_under_maintenance: true }`) is
 * the maintenance-toggle fast path used by the Rooms table switch.
 */
export async function updateRoom(id: string, rawBody: unknown): Promise<RoomDto> {
  const input: UpdateRoomInput = parseOrBadRequest(updateRoomSchema, rawBody);
  const existing = await roomRepository.findById(id);
  if (!existing) {
    throw ApiError.notFound('Room not found');
  }
  if (input.name !== undefined && input.name.toLowerCase() !== existing.name.toLowerCase()) {
    await assertNameAvailable(input.name, id);
  }
  return toRoomDto(await roomRepository.update(id, input));
}