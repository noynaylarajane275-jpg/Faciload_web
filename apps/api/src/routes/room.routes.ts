import { Router, type Request } from 'express';
import { ApiError } from '../errors/apiError.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createRoom, getRoom, listRooms, updateRoom } from '../services/room.service.js';
import { uuidIdSchema } from '../validation/room.validation.js';

export const roomRouter = Router();

function parseId(req: Request): string {
  const parsed = uuidIdSchema.safeParse(req.params.id);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid room id');
  }
  return parsed.data;
}

// Reads: any authenticated role. Writes: CHAIR (requirements.md Section 3).
roomRouter.get(
  '/rooms',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.status(200).json(await listRooms(req.query));
  }),
);

roomRouter.get(
  '/rooms/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.status(200).json({ room: await getRoom(parseId(req)) });
  }),
);

roomRouter.post(
  '/rooms',
  requireAuth,
  requireRole('CHAIR'),
  asyncHandler(async (req, res) => {
    res.status(201).json({ room: await createRoom(req.body) });
  }),
);

// PATCH doubles as the maintenance toggle: `{ is_under_maintenance: true }`
// alone is a valid body.
roomRouter.patch(
  '/rooms/:id',
  requireAuth,
  requireRole('CHAIR'),
  asyncHandler(async (req, res) => {
    res.status(200).json({ room: await updateRoom(parseId(req), req.body) });
  }),
);