import { Router, type Request } from 'express';
import { ApiError } from '../errors/apiError.js';
import { requireAuth, requireLinkedFaculty, requireRole } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  confirmOverride,
  createScheduleSlot,
  deleteScheduleSlot,
  listScheduleSlots,
  resetSchedule,
  updateScheduleSlot,
} from '../services/schedule-slot.service.js';
import { uuidIdSchema } from '../validation/schedule-slot.validation.js';
import { prisma } from '../config/prisma.js';

export const scheduleSlotRouter = Router();

function parseId(req: Request, label: string): string {
  const parsed = uuidIdSchema.safeParse(req.params.id);
  if (!parsed.success) {
    throw ApiError.badRequest(`Invalid ${label} id`);
  }
  return parsed.data;
}

// Reads are open to every authenticated role (Faculty sees the grid; the
// frontend narrows to their own assignments). Writes are CHAIR-only.
scheduleSlotRouter.get(
  '/schedule-slots',
  requireAuth,
  requireLinkedFaculty,
  asyncHandler(async (req, res) => {
    res.status(200).json(await listScheduleSlots(req.query));
  }),
);

// 201 on a clean placement, 409 `{ code: FACULTY_CONFLICT | ROOM_CONFLICT |
// ROOM_MAINTENANCE, details }` when the drop would conflict — the client then
// decides whether to offer the override flow.
scheduleSlotRouter.post(
  '/schedule-slots',
  requireAuth,
  requireRole('CHAIR'),
  asyncHandler(async (req, res) => {
    res.status(201).json({ slot: await createScheduleSlot(req.body) });
  }),
);

// Place despite a known conflict. `:id` = the workload assignment being
// scheduled (the thing the UI drags); body carries the placement echo plus an
// optional `slot_id` when moving a block that PATCH rejected.
scheduleSlotRouter.post(
  '/schedule-slots/:id/confirm-override',
  requireAuth,
  requireRole('CHAIR'),
  asyncHandler(async (req, res) => {
    const assignmentId = parseId(req, 'workload assignment');
    const user = req.user;
    res.status(201).json(
      await confirmOverride(assignmentId, req.body, {
        userId: user?.userId ?? 'unknown',
        role: user?.role ?? 'unknown',
      }),
    );
  }),
);

// Moving/resizing a placed block re-runs the same conflict flow.
scheduleSlotRouter.patch(
  '/schedule-slots/:id',
  requireAuth,
  requireRole('CHAIR'),
  asyncHandler(async (req, res) => {
    res.status(200).json({ slot: await updateScheduleSlot(parseId(req, 'schedule slot'), req.body) });
  }),
);

scheduleSlotRouter.delete(
  '/schedule-slots/:id',
  requireAuth,
  requireRole('CHAIR'),
  asyncHandler(async (req, res) => {
    await deleteScheduleSlot(parseId(req, 'schedule slot'));
    res.status(204).send();
  }),
);

// Bulk reset: clear placed blocks for the term, scoped to all / one faculty /
// one room. CHAIR-only, and the caller's account password is re-verified so
// an unattended session cannot wipe the grid by accident.
scheduleSlotRouter.post(
  '/schedule-slots/reset',
  requireAuth,
  requireRole('CHAIR'),
  asyncHandler(async (req, res) => {
    const user = req.user;
    const stored = user
      ? await prisma.user.findUnique({
          where: { id: user.userId },
          select: { password_hash: true },
        })
      : null;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = await resetSchedule(body, {
      userId: user?.userId ?? 'unknown',
      passwordHash: stored?.password_hash ?? null,
      passwordCandidate: typeof body.password === 'string' ? body.password : '',
    });
    res.status(200).json(result);
  }),
);