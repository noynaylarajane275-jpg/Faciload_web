import { Router, type Request, type Response } from 'express';
import { ApiError } from '../errors/apiError.js';
import { requireAuth, requireLinkedFaculty, requireRole } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createSubject,
  deleteSubject,
  getSubject,
  listSubjects,
  updateSubject,
} from '../services/subject.service.js';
import { uuidIdSchema } from '../validation/subject.validation.js';

export const subjectRouter = Router();

function parseId(req: Request): string {
  const parsed = uuidIdSchema.safeParse(req.params.id);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid subject id');
  }
  return parsed.data;
}

// Reads: any authenticated role (requirements.md Section 3). Writes: CHAIR.
// All handlers are async-wrapped so rejections hit the central error handler.
subjectRouter.get(
  '/subjects',
  requireAuth,
  requireLinkedFaculty,
  asyncHandler(async (req, res) => {
    res.status(200).json(await listSubjects(req.query));
  }),
);

subjectRouter.get(
  '/subjects/:id',
  requireAuth,
  requireLinkedFaculty,
  asyncHandler(async (req, res) => {
    res.status(200).json({ subject: await getSubject(parseId(req)) });
  }),
);

subjectRouter.post(
  '/subjects',
  requireAuth,
  requireRole('CHAIR'),
  asyncHandler(async (req, res) => {
    res.status(201).json({ subject: await createSubject(req.body) });
  }),
);

subjectRouter.patch(
  '/subjects/:id',
  requireAuth,
  requireRole('CHAIR'),
  asyncHandler(async (req, res) => {
    res.status(200).json({ subject: await updateSubject(parseId(req), req.body) });
  }),
);

subjectRouter.delete(
  '/subjects/:id',
  requireAuth,
  requireRole('CHAIR'),
  asyncHandler(async (req, res) => {
    await deleteSubject(parseId(req));
    res.status(204).send();
  }),
);