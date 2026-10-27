import { Router, type Request } from 'express';
import { ApiError } from '../errors/apiError.js';
import { requireAuth, requireLinkedFaculty, requireRole } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createDesignationSession,
  createFacultyDesignation,
  deleteDesignationSession,
  deleteFacultyDesignation,
  listFacultyDesignations,
} from '../services/faculty-designation.service.js';
import { uuidIdSchema } from '../validation/subject.validation.js';

export const facultyDesignationRouter = Router();

function parseId(req: Request): string {
  const parsed = uuidIdSchema.safeParse(req.params.id);
  if (!parsed.success) throw ApiError.badRequest('Invalid designation id');
  return parsed.data;
}

function parseSessionId(req: Request): string {
  const parsed = uuidIdSchema.safeParse(req.params.sessionId);
  if (!parsed.success) throw ApiError.badRequest('Invalid designation session id');
  return parsed.data;
}

facultyDesignationRouter.get(
  '/faculty-designations',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    res.status(200).json(
      await listFacultyDesignations(req.query, user.role, user.facultyId),
    );
  }),
);

facultyDesignationRouter.post(
  '/faculty-designations',
  requireAuth,
  requireRole('CHAIR', 'ACADEMIC_ADMIN'),
  asyncHandler(async (req, res) => {
    res.status(201).json({ designation: await createFacultyDesignation(req.body) });
  }),
);

facultyDesignationRouter.delete(
  '/faculty-designations/:id',
  requireAuth,
  requireRole('CHAIR', 'ACADEMIC_ADMIN'),
  asyncHandler(async (req, res) => {
    await deleteFacultyDesignation(parseId(req));
    res.status(204).send();
  }),
);

facultyDesignationRouter.post(
  '/designation-sessions',
  requireAuth,
  requireLinkedFaculty,
  requireRole('FACULTY'),
  asyncHandler(async (req, res) => {
    res.status(201).json({
      session: await createDesignationSession(req.body, req.user?.facultyId ?? null),
    });
  }),
);

facultyDesignationRouter.delete(
  '/designation-sessions/:sessionId',
  requireAuth,
  requireLinkedFaculty,
  requireRole('FACULTY'),
  asyncHandler(async (req, res) => {
    await deleteDesignationSession(
      parseSessionId(req),
      req.user?.facultyId ?? null,
    );
    res.status(204).send();
  }),
);
