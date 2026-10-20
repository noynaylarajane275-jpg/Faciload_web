import { Router } from 'express';
import { ApiError } from '../errors/apiError.js';
import { requireAuth, requireLinkedFaculty } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  getFacultyScheduleView,
  getRoomScheduleView,
  getRoomsOverview,
  getSectionScheduleView,
} from '../services/schedule-view.service.js';
import { scheduleViewQuerySchema, uuidIdSchema } from '../validation/schedule-view.validation.js';

export const scheduleViewRouter = Router();

function parseId(value: string | undefined, label: string): string {
  const parsed = uuidIdSchema.safeParse(value);
  if (!parsed.success) {
    throw ApiError.badRequest(`Invalid ${label} id`);
  }
  return parsed.data;
}

/**
 * Read-only reshapes of the ScheduleSlot data the drag-and-drop grid writes
 * ("Student Class Program" / "Faculty Class Program" / "Classroom
 * Utilization"). All four are open to every authenticated role — except the
 * faculty view, which FACULTY-role accounts may only call for their own
 * facultyId (the same self-scope the "My Workload" page relies on).
 */
scheduleViewRouter.get(
  '/schedule-views/section/:sectionId',
  requireAuth,
  requireLinkedFaculty,
  asyncHandler(async (req, res) => {
    res.status(200).json(await getSectionScheduleView(parseId(req.params.sectionId, 'section'), req.query));
  }),
);

scheduleViewRouter.get(
  '/schedule-views/faculty/:facultyId',
  requireAuth,
  requireLinkedFaculty,
  asyncHandler(async (req, res) => {
    const facultyId = parseId(req.params.facultyId, 'faculty');
    const user = req.user;
    if (user?.role === 'FACULTY' && user.facultyId !== facultyId) {
      throw new ApiError(403, 'FORBIDDEN', 'Faculty accounts can only view their own schedule');
    }
    res.status(200).json(await getFacultyScheduleView(facultyId, req.query));
  }),
);

scheduleViewRouter.get(
  '/schedule-views/room/:roomId',
  requireAuth,
  requireLinkedFaculty,
  asyncHandler(async (req, res) => {
    res.status(200).json(await getRoomScheduleView(parseId(req.params.roomId, 'room'), req.query));
  }),
);

scheduleViewRouter.get(
  '/schedule-views/rooms-overview',
  requireAuth,
  requireLinkedFaculty,
  asyncHandler(async (req, res) => {
    res.status(200).json(await getRoomsOverview(req.query));
  }),
);
