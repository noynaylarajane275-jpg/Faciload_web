import { useAuthStore } from '../store/auth.store';

const rawApiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

/**
 * Resolve the API base URL that the browser talks to.
 *
 * - unset/empty  -> `http://localhost:4000`, the default two-port dev setup
 *   (Vite on :5173, Express on :4000).
 * - `same-origin` (or `/`) -> `''`, i.e. relative `/api/...` requests. The SPA
 *   then calls whichever host served the page, which is what a single-origin
 *   temporary share (share.bat) needs: the tunnel hostname is only known at
 *   runtime, so it cannot be baked in at build time.
 *
 * A trailing slash is stripped so joining with a leading-slash path can never
 * produce a protocol-relative `//host` URL.
 */
export function resolveApiBase(raw: string): string {
  const value = raw.trim();
  if (value === '' ) return 'http://localhost:4000';
  if (value === 'same-origin' || value === '/') return '';
  return value.replace(/\/+$/, '');
}

export const apiBase = resolveApiBase(rawApiBase);

/**
 * Resolve a server-provided asset path (avatar photo) against the API base.
 * Absolute URLs pass through untouched; empty values return null so callers
 * can fall back to initials cleanly.
 */
export function apiAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${apiBase}${path.startsWith('/') ? '' : '/'}${path}`;
}

export interface ApiError extends Error {
  status: number;
  /** Server error code (e.g. `FACULTY_CONFLICT`, `ROOM_DUPLICATE_NAME`) when
   *  the response carried one — the Schedule page keys its override flow off
   *  this rather than string-matching the message. */
  code?: string;
  /** Structured `error.details` payload (conflict slot summaries, field names…). */
  details?: unknown;
}

function toApiError(status: number, message: string, code?: string, details?: unknown): ApiError {
  const err = new Error(message) as ApiError;
  err.status = status;
  err.code = code;
  err.details = details;
  return err;
}

export interface ApiOptions extends RequestInit {
  /** Set false to skip the Authorization header / refresh retry (e.g. login itself). */
  auth?: boolean;
}

/**
 * Shared API client: attaches the in-memory access token to every request
 * and attempts one silent refresh on a 401 before failing.
 */
export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { auth = true, headers, ...init } = options;

  const doFetch = async (token: string | null): Promise<Response> => {
    // FormData (multipart uploads) must set its own Content-Type boundary —
    // everything else apiFetch sends is a JSON string, so it needs the JSON
    // default. Without this, fetch() labels a string body
    // `text/plain;charset=UTF-8`, which express.json() ignores — req.body then
    // arrives empty and the API answers 400 "Invalid request" with every field
    // reported as missing.
    const baseHeaders: Record<string, string> = {};
    if (headers) {
      new Headers(headers).forEach((value, key) => {
        baseHeaders[key] = value;
      });
    }
    if (!(init.body instanceof FormData)) {
      baseHeaders['Content-Type'] = 'application/json';
    }
    return fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        ...baseHeaders,
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  };

  let token = auth ? useAuthStore.getState().accessToken : null;
  let res = await doFetch(token);

  if (res.status === 401 && auth) {
    try {
      token = await refreshAccessToken();
    } catch (err) {
      throw err instanceof Error ? err : toApiError(401, 'Unauthorized');
    }
    res = await doFetch(token);
  }

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    let code: string | undefined;
    let details: unknown;
    try {
      const body = JSON.parse(await res.text()) as {
        error?: { code?: string; message?: string; details?: unknown };
      };
      if (body.error?.message) {
        message = body.error.message;
      }
      code = body.error?.code;
      details = body.error?.details;
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw toApiError(res.status, message, code, details);
  }

  // 204 No Content (e.g. DELETE) has no body — don't try to parse it.
  const text = await res.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: 'CHAIR' | 'FACULTY' | 'ACADEMIC_ADMIN';
    facultyId: string | null;
    avatar_url?: string | null;
  };
}

export interface RefreshResponse {
  accessToken: string;
  /** Current user, re-read from the DB — lets a reload fully restore state. */
  user: LoginResponse['user'];
}

/**
 * Exchange a refresh token for a fresh access token + the current user.
 * Used by SessionBootstrap to restore the session on page reload and by the
 * silent 401 retry below. Throws an ApiError (with `status`) when the server
 * rejects the token, so callers can distinguish "invalid token" (401) from
 * network/server failures.
 */
export async function refreshSessionRequest(refreshToken: string): Promise<RefreshResponse> {
  const res = await fetch(`${apiBase}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    throw toApiError(res.status, 'Session expired. Please log in again.');
  }
  const body = (await res.json()) as Partial<RefreshResponse>;
  if (typeof body.accessToken !== 'string' || !body.user) {
    throw toApiError(500, 'Malformed refresh response');
  }
  return body as RefreshResponse;
}

async function refreshAccessToken(): Promise<string> {
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) {
    throw toApiError(401, 'No refresh token available');
  }
  const res = await fetch(`${apiBase}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    useAuthStore.getState().logout();
    throw toApiError(res.status, 'Session expired. Please log in again.');
  }
  const body = (await res.json()) as Partial<RefreshResponse>;
  if (typeof body.accessToken !== 'string' || !body.user) {
    throw toApiError(500, 'Malformed refresh response');
  }
  // Re-read from the DB on every refresh, so role changes / deactivation
  // become visible mid-session without waiting for the next reload.
  useAuthStore.getState().setUser(body.user);
  useAuthStore.getState().setAccessToken(body.accessToken);
  return body.accessToken;
}

export async function loginRequest(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${apiBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as LoginResponse & { error?: { message?: string; code?: string } };
  if (!res.ok) {
    // Backend already returns the generic "Invalid email or password".
    throw toApiError(res.status, body.error?.message ?? 'Invalid email or password', body.error?.code);
  }
  return body;
}

/**
 * Public self-registration. Creates a FACULTY-role user with facultyId null —
 * the account can sign in but sees the "awaiting approval" screen until a
 * a manager links it through Faculty Management. Same response shape as login so
 * the caller can sign the user straight in.
 */
export async function registerRequest(email: string, password: string, confirmPassword: string): Promise<LoginResponse> {
  const res = await fetch(`${apiBase}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, confirmPassword }),
  });
  const body = (await res.json()) as LoginResponse & { error?: { message?: string; code?: string; details?: unknown } };
  if (!res.ok) {
    throw toApiError(res.status, body.error?.message ?? 'Could not create your account', body.error?.code, body.error?.details);
  }
  return body;
}

export async function logoutRequest(refreshToken: string | null): Promise<void> {
  if (!refreshToken) {
    return;
  }
  try {
    await fetch(`${apiBase}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // Logout is best-effort from the client; local state clears regardless.
  }
}
