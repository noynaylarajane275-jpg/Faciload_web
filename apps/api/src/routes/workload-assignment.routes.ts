import { Router, type Request } from 'express';
import { ApiError } from '../errors/apiError.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createWorkloadAssignment,
  deleteWorkloadAssignment,
  getWorkloadAssignment,
  listWorkloadAssignments,
  updateWorkloadAssignment,
} from '../services/workload-assignment.service.js';
import { uuidIdSchema } from '../validation/workload-assignment.validation.js';

export const workloadAssignmentRouter = Router();

function parseId(req: Request): string {
  const parsed = uuidIdSchema.safeParse(req.params.id);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid workload assignment id');
  }
  return parsed.data;
}

// Reads: any authenticated role (the Schedule sidebar loads these for the
// active term). Writes: CHAIR.
workloadAssignmentRouter.get(
  '/workload-assignments',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.status(200).json(await listWorkloadAssignments(req.query));
  }),
);

workloadAssignmentRouter.get(
  '/workload-assignments/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.status(200).json({ assignment: await getWorkloadAssignment(parseId(req)) });
  }),
);

workloadAssignmentRouter.post(
  '/workload-assignments',
  requireAuth,
  requireRole('CHAIR'),
  asyncHandler(async (req, res) => {
    res.status(201).json({ assignment: await createWorkloadAssignment(req.body) });
  }),
);

workloadAssignmentRouter.delete(
  '/workload-assignments/:id',
  requireAuth,
  requireRole('CHAIR'),
  asyncHandler(async (req, res) => {
    await deleteWorkloadAssignment(parseId(req));
    res.status(204).send();
  }),
);

workloadAssignmentRouter.patch(
  '/workload-assignments/:id',
  requireAuth,
  requireRole('CHAIR'),
  asyncHandler(async (req, res) => {
    const updated = await updateWorkloadAssignment(parseId(req), req.body);
    res.status(200).json({ assignment: updated });
  }),
);