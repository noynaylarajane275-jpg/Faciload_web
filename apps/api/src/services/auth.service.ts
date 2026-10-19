import 'dotenv/config';
import bcrypt from 'bcrypt';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { Role } from '../types/domain.js';

/**
 * Token payload carried by both access and refresh JWTs.
 * Access vs. refresh tokens are distinguished by the secret they are
 * signed with (JWT_SECRET vs. JWT_REFRESH_SECRET), so a refresh token
 * can never be used as an access token and vice versa.
 */
export interface AuthTokenPayload {
  userId: string;
  role: Role;
  facultyId: string | null;
}

/** bcrypt cost factor. 10 matches the seed script; fast enough for tests. */
const SALT_ROUNDS = 10;

function getAccessSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  return secret;
}

function getRefreshSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET is not set');
  }
  return secret;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getAccessSecret(), { expiresIn: '15m' });
}

export function signRefreshToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getRefreshSecret(), { expiresIn: '7d' });
}

function toAuthPayload(decoded: string | JwtPayload): AuthTokenPayload {
  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('Invalid token payload');
  }
  const { userId, role, facultyId } = decoded as Record<string, unknown>;
  if (typeof userId !== 'string' || typeof role !== 'string') {
    throw new Error('Invalid token payload');
  }
  return {
    userId,
    role: role as Role,
    facultyId: typeof facultyId === 'string' ? facultyId : null,
  };
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, getAccessSecret());
  return toAuthPayload(decoded);
}

export function verifyRefreshToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, getRefreshSecret());
  return toAuthPayload(decoded);
}

/**
 * Refresh-token invalidation strategy: in-memory denylist.
 *
 * POST /api/auth/logout adds the presented refresh token to this set, and
 * POST /api/auth/refresh rejects any token found in it.
 *
 * Tradeoff (documented per Phase 2 spec): this is sufficient for a
 * single-instance dev server, but it does not survive restarts and does not
 * work across multiple instances. Production should persist revoked/rotated
 * refresh tokens (DB table or Redis) and rotate the refresh token on every
 * use instead of only denying logged-out ones.
 */
const revokedRefreshTokens = new Set<string>();

export function revokeRefreshToken(token: string): void {
  revokedRefreshTokens.add(token);
}

export function isRefreshTokenRevoked(token: string): boolean {
  return revokedRefreshTokens.has(token);
}

/** Test-only helper to reset the in-memory denylist between tests. */
export function clearRevokedRefreshTokensForTests(): void {
  revokedRefreshTokens.clear();
}
