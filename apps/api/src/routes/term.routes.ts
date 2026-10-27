import { Router, type Request } from 'express';
import { ApiError } from '../errors/apiError.js';
import { requireAuth, requireLinkedFaculty, requireRole } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createTerm,
  getActiveTerm,
  listTerms,
  updateTerm,
} from '../services/term.service.js';
import { uuidIdSchema } from '../validation/term.validation.js';

export const termRouter = Router();

function parseId(req: Request): string {
  const parsed = uuidIdSchema.safeParse(req.params.id);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid term id');
  }
  return parsed.data;
}

// Reads: any authenticated role (header Term selector, Schedule page).
// Writes: Chair and Academic Admin.
termRouter.get(
  '/terms',
  requireAuth,
  requireLinkedFaculty,
  asyncHandler(async (_req, res) => {
    res.status(200).json(await listTerms());
  }),
);

// Must be registered before '/terms/:id' so "active" is not parsed as an id.
termRouter.get(
  '/terms/active',
  requireAuth,
  requireLinkedFaculty,
  asyncHandler(async (_req, res) => {
    res.status(200).json(await getActiveTerm());
  }),
);

termRouter.post(
  '/terms',
  requireAuth,
  requireRole('CHAIR', 'ACADEMIC_ADMIN'),
  asyncHandler(async (req, res) => {
    res.status(201).json({ term: await createTerm(req.body) });
  }),
);

// Activating a term (`{ is_active: true }`) deactivates any other active term.
termRouter.patch(
  '/terms/:id',
  requireAuth,
  requireRole('CHAIR', 'ACADEMIC_ADMIN'),
  asyncHandler(async (req, res) => {
    res.status(200).json({ term: await updateTerm(parseId(req), req.body) });
  }),
);