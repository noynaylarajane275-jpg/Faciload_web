import type { NextFunction, Request, Response } from 'express';
import type { Role } from '../types/domain.js';
import { verifyAccessToken, type AuthTokenPayload } from '../services/auth.service.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

/**
 * Generic auth middleware for ALL future routes (Phase 3+).
 * Do not build feature-specific auth checks elsewhere — compose
 * requireAuth + requireRole(...) on every protected route.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' } });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' } });
    return;
  }

  try {
    req.user = verifyAccessToken(token);
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
    return;
  }
  next();
}

export function requireRole(...allowedRoles: Role[]): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      return;
    }
    next();
  };
}

/**
 * Block FACULTY-role accounts that have no linked faculty record.
 *
 * Self-registered accounts are created with `faculty_id = null` on purpose:
 * they may sign in (so they can see the "awaiting approval" screen) but must
 * not read any department/faculty data until a Chair or Academic Admin links them through
 * Faculty Management. CHAIR / ACADEMIC_ADMIN are never gated by this check.
 */
export function requireLinkedFaculty(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  if (req.user.role === 'FACULTY' && !req.user.facultyId) {
    res.status(403).json({
      error: {
        code: 'FACULTY_NOT_LINKED',
        message: 'Your account is not linked to a faculty record yet. Ask the department chair to link it.',
      },
    });
    return;
  }
  next();
}
