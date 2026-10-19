import { beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  clearRevokedRefreshTokensForTests,
  hashPassword,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from './auth.service.js';

beforeAll(() => {
  process.env.JWT_SECRET ??= 'test-access-secret';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
  clearRevokedRefreshTokensForTests();
});

describe('auth.service password hashing', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(hash).not.toBe('correct-horse-battery');
    await expect(verifyPassword('correct-horse-battery', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });
});

describe('auth.service access tokens', () => {
  it('signs a payload that verifies and decodes correctly', () => {
    const accessToken = signAccessToken({ userId: 'user-123', role: 'CHAIR', facultyId: null });
    const payload = verifyAccessToken(accessToken);
    expect(payload).toMatchObject({ userId: 'user-123', role: 'CHAIR', facultyId: null });
  });

  it('rejects an expired token', () => {
    const secret = process.env.JWT_SECRET as string;
    const expired = jwt.sign({ userId: 'user-123', role: 'CHAIR', facultyId: null }, secret, { expiresIn: '-10s' });
    expect(() => verifyAccessToken(expired)).toThrow();
  });
});
