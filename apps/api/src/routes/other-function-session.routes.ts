import { Router, type Request } from 'express';
import { ApiError } from '../errors/apiError.js';
import { requireAuth, requireLinkedFaculty, requireRole } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createOtherFunctionSession,
  deleteOtherFunctionSession,
  listOtherFunctionSessions,
} from '../services/other-function-session.service.js';
import { uuidIdSchema } from '../validation/subject.validation.js';

export const otherFunctionSessionRouter = Router();

function parseId(req: Request): string {
  const parsed = uuidIdSchema.safeParse(req.params.id);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid other function session id');
  }
  return parsed.data;
}

otherFunctionSessionRouter.get(
  '/other-function-sessions',
  requireAuth,
  requireLinkedFaculty,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    res.status(200).json(
      await listOtherFunctionSessions(req.query, user.role, user.facultyId),
    );
  }),
);

otherFunctionSessionRouter.post(
  '/other-function-sessions',
  requireAuth,
  requireLinkedFaculty,
  requireRole('FACULTY'),
  asyncHandler(async (req, res) => {
    res.status(201).json({
      session: await createOtherFunctionSession(req.body, req.user?.facultyId ?? null),
    });
  }),
);

otherFunctionSessionRouter.delete(
  '/other-function-sessions/:id',
  requireAuth,
  requireLinkedFaculty,
  requireRole('FACULTY'),
  asyncHandler(async (req, res) => {
    await deleteOtherFunctionSession(parseId(req), req.user?.facultyId ?? null);
    res.status(204).send();
  }),
);
