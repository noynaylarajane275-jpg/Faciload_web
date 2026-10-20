import { Router, type Request, type Response } from 'express';
import {
  hashPassword,
  isRefreshTokenRevoked,
  revokeRefreshToken,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyRefreshToken,
  type AuthTokenPayload,
} from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { loginSchema, refreshSchema, registerSchema } from '../validation/auth.validation.js';
import { prisma } from '../config/prisma.js';

export const authRouter = Router();

function toPublicUser(user: {
  id: string;
  email: string;
  role: string;
  faculty_id: string | null;
  avatar_url?: string | null;
}): {
  id: string;
  email: string;
  role: AuthTokenPayload['role'];
  facultyId: string | null;
  avatar_url: string | null;
} {
  return {
    id: user.id,
    email: user.email,
    role: user.role as AuthTokenPayload['role'],
    facultyId: user.faculty_id,
    avatar_url: user.avatar_url ?? null,
  };
}

// Wrapped in asyncHandler (Express 4 does not forward async rejections): without
// it, a Prisma/DB failure inside this handler became an unhandled rejection that
// killed the entire API process — the web app then reported "Failed to fetch"
// because nothing was listening on :4000 at all, not because of CORS or a bad URL.
authRouter.post('/auth/login', asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.flatten() },
    });
    return;
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  // Generic message: never reveal whether the email or password was wrong.
  const invalidCredentials = { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } };
  if (!user) {
    res.status(401).json(invalidCredentials);
    return;
  }
  if (!user.is_active) {
    res.status(401).json(invalidCredentials);
    return;
  }
  const passwordOk = await verifyPassword(password, user.password_hash);
  if (!passwordOk) {
    res.status(401).json(invalidCredentials);
    return;
  }

  const payload: AuthTokenPayload = {
    userId: user.id,
    role: user.role as AuthTokenPayload['role'],
    facultyId: user.faculty_id,
  };
  res.status(200).json({
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    user: toPublicUser(user),
  });
}));

/**
 * POST /api/auth/register — public self-registration.
 *
 * Creates a FACULTY-role User with `faculty_id = null` (and no faculty row).
 * The account can sign in but `requireLinkedFaculty` blocks it from every
 * data route until a Chair links it through Faculty Management. Returns the
 * same shape as login (tokens + public user) so the client can sign the user
 * straight in to the "awaiting approval" screen.
 */
authRouter.post('/auth/register', asyncHandler(async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.flatten() },
    });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  const taken = await prisma.user.findUnique({ where: { email } });
  if (taken) {
    res.status(409).json({
      error: { code: 'USER_EMAIL_IN_USE', message: `Email "${parsed.data.email}" is already in use` },
    });
    return;
  }

  const created = await prisma.user.create({
    data: {
      email,
      password_hash: await hashPassword(parsed.data.password),
      role: 'FACULTY',
      faculty_id: null,
      is_active: true,
    },
  });

  const payload: AuthTokenPayload = {
    userId: created.id,
    role: 'FACULTY',
    facultyId: null,
  };
  res.status(201).json({
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    user: toPublicUser(created),
  });
}));

authRouter.post('/auth/refresh', asyncHandler(async (req: Request, res: Response) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.flatten() },
    });
    return;
  }

  const { refreshToken } = parsed.data;
  if (isRefreshTokenRevoked(refreshToken)) {
    res.status(401).json({ error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token' } });
    return;
  }

  let payload: AuthTokenPayload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    res.status(401).json({ error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token' } });
    return;
  }

  // Fresh payload from the database so role changes / deactivation take
  // effect on the next refresh instead of lingering for 7 days.
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || !user.is_active) {
    res.status(401).json({ error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token' } });
    return;
  }

  const freshPayload: AuthTokenPayload = {
    userId: user.id,
    role: user.role as AuthTokenPayload['role'],
    facultyId: user.faculty_id,
  };
  // `user` is included so the web app can fully restore an in-memory session
  // from the persisted refresh token on page reload (SessionBootstrap) —
  // same public shape as the login response.
  res.status(200).json({ accessToken: signAccessToken(freshPayload), user: toPublicUser(user) });
}));

authRouter.post('/auth/logout', (req: Request, res: Response) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.flatten() },
    });
    return;
  }

  // Denylist approach (see auth.service.ts comment). Always return 200 so
  // logout is idempotent — logging out twice is not an error.
  revokeRefreshToken(parsed.data.refreshToken);
  res.status(200).json({ message: 'Logged out' });
});
