import { z } from 'zod';

/** Shared UUID param validation (same contract as subject.validation.ts). */
export { uuidIdSchema } from './subject.validation.js';

/**
 * Required, trimmed text — blank strings are treated as missing so the
 * "required" message surfaces (mirrors subject.validation.ts presentString).
 */
function presentString(label: string, max: number) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
      .trim()
      .min(1, `${label} is required`)
      .max(max, `${label} must be at most ${max} characters`),
  );
}

/** Accepts JSON booleans and "true"/"false" strings; rejects everything else. */
function booleanFrom(label: string) {
  return z.preprocess((value) => {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string' && (value === 'true' || value === 'false')) {
      return value === 'true';
    }
    return value;
  }, z.boolean({ invalid_type_error: `${label} must be true or false` }));
}

export const createRoomSchema = z
  .object({
    name: presentString('Room name', 120),
    is_under_maintenance: booleanFrom('Maintenance flag').default(false),
  })
  .strict();

export type CreateRoomInput = z.infer<typeof createRoomSchema>;

/**
 * PATCH is deliberately partial-with-at-least-one-field so the Rooms table can
 * send `{ is_under_maintenance: true }` alone — the fast single-field
 * maintenance toggle — without a read-modify-write of the other columns.
 */
export const updateRoomSchema = z
  .object({
    name: presentString('Room name', 120).optional(),
    is_under_maintenance: booleanFrom('Maintenance flag').optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

/** GET /api/rooms query params: search-by-name only (no pagination — rooms
 *  are a small, fully-loaded list that also feeds every room dropdown). */
export const roomQuerySchema = z.object({
  search: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(100, 'Search must be at most 100 characters').optional(),
  ),
});

export type RoomQueryInput = z.infer<typeof roomQuerySchema>;