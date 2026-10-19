import { useEffect, type ReactNode } from 'react';
import { refreshSessionRequest } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';

/**
 * Runs once on app boot, before any protected route renders.
 *
 * Why this exists: the access token and user live only in memory, so a hard
 * page reload resets `isAuthenticated` to false. Without this boot check the
 * route guard (RequireAuth) would immediately redirect an authenticated user
 * to Landing. Here we attempt to restore the session first:
 *
 * 1. Refresh token persisted in localStorage (see auth.store.ts tradeoff
 *    comment) is exchanged via POST /api/auth/refresh for a fresh access
 *    token + the current user.
 * 2. Success → user/accessToken/isAuthenticated are re-populated.
 * 3. Server rejects the token (expired/revoked, 401) → ALL state is cleared,
 *    including the stored token, so the next visit starts clean.
 * 4. Network/server failure → the runtime session is cleared (the guard then
 *    shows the logged-out UI) but the persisted token is KEPT — a later
 *    reload can still restore the session once the API is reachable again.
 *
 * In every path `finishSessionCheck()` flips `isInitializing` to false, which
 * is the signal RequireAuth waits for before making its redirect decision.
 */
export function SessionBootstrap({ children }: { children: ReactNode }): JSX.Element {
  const finishSessionCheck = useAuthStore((s) => s.finishSessionCheck);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession(): Promise<void> {
      const { refreshToken, isAuthenticated } = useAuthStore.getState();
      // A login may already have completed while this check was in flight
      // (e.g. the modal is fast) — an in-memory session needs no restore.
      if (!refreshToken || isAuthenticated) {
        finishSessionCheck();
        return;
      }
      try {
        const result = await refreshSessionRequest(refreshToken);
        if (cancelled) {
          return;
        }
        useAuthStore.setState({
          user: result.user,
          accessToken: result.accessToken,
          isAuthenticated: true,
        });
      } catch (err) {
        if (cancelled) {
          return;
        }
        const status =
          typeof err === 'object' && err !== null && 'status' in err
            ? Number((err as { status?: unknown }).status)
            : Number.NaN;
        if (status === 401) {
          // Expired/invalid token: clear everything, stored token included.
          useAuthStore.getState().logout();
        } else {
          // Network/server hiccup: keep the persisted token for a later retry.
          useAuthStore.setState({ user: null, accessToken: null, isAuthenticated: false });
        }
      } finally {
        if (!cancelled) {
          finishSessionCheck();
        }
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, [finishSessionCheck]);

  return <>{children}</>;
}
