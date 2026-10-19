import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from './app.js';
import { prisma } from './config/prisma.js';
import { clearRevokedRefreshTokensForTests, hashPassword, signAccessToken } from './services/auth.service.js';
import { requireAuth, requireRole } from './middleware/auth.middleware.js';
import express, { type Request, type Response } from 'express';

beforeAll(() => {
  process.env.JWT_SECRET ??= 'test-access-secret';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
});

beforeEach(() => {
  clearRevokedRefreshTokensForTests();
});

const LOGIN_EMAIL = `login-test-${process.pid}@faciload.local`;

async function seedLoginUser(): Promise<{ email: string; password: string }> {
  const password = 'Test-Password-123';
  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email: LOGIN_EMAIL },
    update: { password_hash: passwordHash, role: 'CHAIR', is_active: true, faculty_id: null },
    create: { email: LOGIN_EMAIL, password_hash: passwordHash, role: 'CHAIR', is_active: true },
  });
  return { email: LOGIN_EMAIL, password };
}

describe('POST /api/auth/login', () => {
  it('returns tokens on success', async () => {
    const { email, password } = await seedLoginUser();
    const res = await request(createApp()).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.user).toMatchObject({ email, role: 'CHAIR', facultyId: null });
  });

  it('returns 401 with a generic message for a wrong password', async () => {
    const { email } = await seedLoginUser();
    const res = await request(createApp()).post('/api/auth/login').send({ email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('returns 401 for an inactive account', async () => {
    const { email, password } = await seedLoginUser();
    await prisma.user.update({ where: { email }, data: { is_active: false } });
    try {
      const res = await request(createApp()).post('/api/auth/login').send({ email, password });
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid email or password');
    } finally {
      await prisma.user.update({ where: { email }, data: { is_active: true } });
    }
  });
});

describe('POST /api/auth/refresh + logout', () => {
  it('issues a new access token and returns the current user', async () => {
    const { email, password } = await seedLoginUser();
    const app = createApp();
    const login = await request(app).post('/api/auth/login').send({ email, password });
    const refresh = await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken });
    expect(refresh.status).toBe(200);
    expect(typeof refresh.body.accessToken).toBe('string');
    // The web app's boot-time session restore (SessionBootstrap) needs the
    // user object to repopulate the in-memory session after a page reload.
    expect(refresh.body.user).toMatchObject({ email, role: 'CHAIR', facultyId: null });
  });

  it('returns 401 for an invalid refresh token', async () => {
    const res = await request(createApp()).post('/api/auth/refresh').send({ refreshToken: 'not-a-real-token' });
    expect(res.status).toBe(401);
  });

  it('rejects a refresh token after logout', async () => {
    const { email, password } = await seedLoginUser();
    const app = createApp();
    const login = await request(app).post('/api/auth/login').send({ email, password });
    const logout = await request(app).post('/api/auth/logout').send({ refreshToken: login.body.refreshToken });
    expect(logout.status).toBe(200);
    const refresh = await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken });
    expect(refresh.status).toBe(401);
  });
});

describe('requireAuth + requireRole', () => {
  function guardedApp(): express.Express {
    // Standalone app (not createApp()): createApp() mounts its 404 handler
    // before we could add a test route, so build a minimal app with the
    // same middleware piece under test.
    const app = express();
    app.use(express.json());
    // Temporary dummy protected route — used only to verify the generic
    // middleware here. The dummy exists solely inside this test; it is
    // never mounted in src/app.ts. Real Phase 3 routes will compose the
    // same middleware.
    app.get('/guard-check', requireAuth, requireRole('CHAIR'), (_req: Request, res: Response) => {
      res.status(200).json({ ok: true });
    });
    return app;
  }

  it('returns 401 without a token', async () => {
    const res = await request(guardedApp()).get('/guard-check');
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await request(guardedApp()).get('/guard-check').set('Authorization', 'Bearer bogus');
    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired token', async () => {
    const expired = jwt.sign({ userId: 'u-1', role: 'CHAIR', facultyId: null }, process.env.JWT_SECRET as string, {
      expiresIn: '-10s',
    });
    const res = await request(guardedApp()).get('/guard-check').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for a valid token with the wrong role', async () => {
    const token = signAccessToken({ userId: 'u-1', role: 'FACULTY', facultyId: null });
    const res = await request(guardedApp()).get('/guard-check').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 for a valid token with the correct role', async () => {
    const token = signAccessToken({ userId: 'u-1', role: 'CHAIR', facultyId: null });
    const res = await request(guardedApp()).get('/guard-check').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
