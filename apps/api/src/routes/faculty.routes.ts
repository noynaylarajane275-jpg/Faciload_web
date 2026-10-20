import { Router, type Request, type Response } from 'express';
import { ApiError } from '../errors/apiError.js';
import { requireAuth, requireLinkedFaculty, requireRole } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createFaculty,
  deleteFaculty,
  getFaculty,
  linkExistingUser,
  listFaculty,
  listUnlinkedUsers,
  updateFaculty,
} from '../services/faculty.service.js';
import { uuidIdSchema } from '../validation/faculty.validation.js';

export const facultyRouter = Router();

function parseId(req: Request): string {
  const parsed = uuidIdSchema.safeParse(req.params.id);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid faculty id');
  }
  return parsed.data;
}

// Same shape as subject.routes.ts: reads for any authenticated role,
// writes CHAIR-only (requirements.md §3). FACULTY-role accounts must also be
// linked to a faculty record — unlinked (self-registered, awaiting approval)
// accounts can sign in but see no department data until a Chair links them.
facultyRouter.get(
  '/faculty',
  requireAuth,
  requireLinkedFaculty,
  asyncHandler(async (req, res) => {
    res.status(200).json(await listFaculty(req.query));
  }),
);

facultyRouter.get(
  '/faculty/unlinked-users',
  requireAuth,
  requireRole('CHAIR'),
  asyncHandler(async (req, res) => {
    res.status(200).json(await listUnlinkedUsers());
  }),
);

facultyRouter.get(
  '/faculty/:id',
  requireAuth,
  requireLinkedFaculty,
  asyncHandler(async (req, res) => {
    res.status(200).json({ faculty: await getFaculty(parseId(req)) });
  }),
);

facultyRouter.post(
  '/faculty',
  requireAuth,
  requireRole('CHAIR'),
  asyncHandler(async (req, res) => {
    res.status(201).json({ faculty: await createFaculty(req.body) });
  }),
);

facultyRouter.patch(
  '/faculty/:id',
  requireAuth,
  requireRole('CHAIR'),
  asyncHandler(async (req, res) => {
    res.status(200).json({ faculty: await updateFaculty(parseId(req), req.body) });
  }),
);

/**
 * POST /api/faculty/:id/link-user — connect a self-registered (unlinked) user
 * to an existing faculty record created without a login. The approval path
 * for accounts that registered before their faculty row existed.
 */
facultyRouter.post(
  '/faculty/:id/link-user',
  requireAuth,
  requireRole('CHAIR'),
  asyncHandler(async (req, res) => {
    res.status(200).json({ faculty: await linkExistingUser(parseId(req), req.body) });
  }),
);

facultyRouter.delete(
  '/faculty/:id',
  requireAuth,
  requireRole('CHAIR'),
  asyncHandler(async (req, res) => {
    await deleteFaculty(parseId(req), {
      confirmLinkedUser: req.query['confirmLinkedUser'],
    });
    res.status(204).send();
  }),
);