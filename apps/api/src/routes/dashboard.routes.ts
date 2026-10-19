import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getDashboardSummary } from '../services/dashboard.service.js';

export const dashboardRouter = Router();

/**
 * GET /api/dashboard/summary?termId= — role-scoped overview (FR-06/FR-08).
 * CHAIR / ACADEMIC_ADMIN get department-wide numbers; FACULTY get only their
 * own summary. requireAuth guarantees req.user; the service resolves the
 * faculty record from the token so a Faculty caller can never pull another
 * instructor's rows.
 */
dashboardRouter.get(
  '/dashboard/summary',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }
    res.status(200).json({ summary: await getDashboardSummary(req.query, req.user) });
  }),
);
