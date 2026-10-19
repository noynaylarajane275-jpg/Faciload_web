import { create } from 'zustand';

export type AuthRole = 'CHAIR' | 'FACULTY' | 'ACADEMIC_ADMIN';

export interface AuthUser {
  id: string;
  email: string;
  role: AuthRole;
  facultyId: string | null;
  /** Profile photo URL (path served by the API, e.g. /uploads/avatars/x.png). */
  avatar_url?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  /**
   * True from store creation until the boot-time session check resolves
   * (SessionBootstrap). Route guards must NOT redirect while this is true:
   * a hard reload wipes the in-memory access token/user, so without this
   * gate the guard would bounce an authenticated user to Landing before
   * the refresh round-trip has had a chance to restore the session.
   */
  isInitializing: boolean;
  login: (input: { user: AuthUser; accessToken: string; refreshToken: string }) => void;
  setAccessToken: (token: string) => void;
  setUser: (user: AuthUser) => void;
  /** Patch only the avatar after an upload (keeps the rest of the user). */
  setAvatarUrl: (avatarUrl: string | null) => void;
  finishSessionCheck: () => void;
  logout: () => void;
}

const REFRESH_STORAGE_KEY = 'faciload.refreshToken';

/**
 * Token-storage tradeoff (documented per Phase 2 spec):
 *
 * - Access token lives only in memory (this Zustand store). It is never
 *   written to localStorage, so a stored-XSS payload cannot exfiltrate a
 *   long-lived credential from disk — but the session does not survive a
 *   page reload without a refresh round-trip.
 * - Refresh token is persisted in localStorage so sessions survive reloads:
 *   on boot, SessionBootstrap exchanges the persisted token for a fresh
 *   access token + user before any protected route renders. (Storage
 *   approach unchanged from the original Phase 2 decision — what was
 *   missing was the boot-time restore itself, not the persistence.)
 *   An httpOnly, Secure, SameSite cookie set by the backend would be
 *   strictly safer (JS cannot read it, CSRF mitigated via SameSite), but
 *   that requires cookie-based refresh endpoints + CSRF handling, which is
 *   out of scope for Phase 2. If the app is ever exposed beyond local dev,
 *   migrate refresh transport to httpOnly cookies.
 */
function readPersistedRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistRefreshToken(token: string | null): void {
  try {
    if (token === null) {
      localStorage.removeItem(REFRESH_STORAGE_KEY);
    } else {
      localStorage.setItem(REFRESH_STORAGE_KEY, token);
    }
  } catch {
    // Storage unavailable (private mode, SSR) — session just won't persist.
  }
}

export function getPersistedRefreshToken(): string | null {
  return readPersistedRefreshToken();
}

/** Hydrate the store's refresh token from localStorage on app boot. */
export function restoreRefreshToken(): string | null {
  return readPersistedRefreshToken();
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  accessToken: null,
  refreshToken: readPersistedRefreshToken(),
  isAuthenticated: false,
  isInitializing: true,
  login: ({ user, accessToken, refreshToken }) => {
    persistRefreshToken(refreshToken);
    set({ user, accessToken, refreshToken, isAuthenticated: true, isInitializing: false });
  },
  setAccessToken: (accessToken) => set({ accessToken }),
  setUser: (user) => set({ user }),
  setAvatarUrl: (avatarUrl) =>
    set((state) => (state.user ? { user: { ...state.user, avatar_url: avatarUrl } } : state)),
  finishSessionCheck: () => set({ isInitializing: false }),
  logout: () => {
    persistRefreshToken(null);
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isInitializing: false,
    });
  },
}));
