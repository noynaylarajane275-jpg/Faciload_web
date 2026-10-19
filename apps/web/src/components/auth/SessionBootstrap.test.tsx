/**
 * Boot-time session restore (Part 1 — "reload kicks to Landing" bug).
 * Covers SessionBootstrap + RequireAuth interplay:
 *  - no redirect decision while the check is in flight (spinner, no flash)
 *  - persisted refresh token → session restored, protected page renders
 *  - no persisted token → redirected to /login once the check completes
 *  - rejected/expired refresh token → logged-out state, stale token cleared
 */
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '../RequireAuth';
import { SessionBootstrap } from './SessionBootstrap';
import { refreshSessionRequest } from '../../lib/api';
import { useAuthStore, type AuthUser } from '../../store/auth.store';

vi.mock('../../lib/api', () => ({
  refreshSessionRequest: vi.fn(),
}));

const refreshSessionRequestMock = vi.mocked(refreshSessionRequest);

// Must match REFRESH_STORAGE_KEY in auth.store.ts.
const REFRESH_STORAGE_KEY = 'faciload.refreshToken';

const RESTORED_USER: AuthUser = {
  id: 'u-1',
  email: 'chair@faciload.local',
  role: 'CHAIR',
  facultyId: null,
};

function storeRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_STORAGE_KEY, token);
  useAuthStore.setState({ refreshToken: token });
}

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <SessionBootstrap>
        <Routes>
          <Route path="/" element={<div>Landing page</div>} />
          <Route path="/login" element={<div>Login page</div>} />
          <Route
            path="/schedule"
            element={
              <RequireAuth>
                <div>Schedule content</div>
              </RequireAuth>
            }
          />
        </Routes>
      </SessionBootstrap>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useAuthStore.getState().logout();
  // Reset to the store's boot state — logout() already cleared the session,
  // but tests that log in leave isInitializing false, so force it back.
  useAuthStore.setState({ isInitializing: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  useAuthStore.getState().logout();
});

describe('SessionBootstrap + RequireAuth — reload behavior', () => {
  it('shows the loading state and does NOT redirect while the session check is in flight', async () => {
    // A stored refresh token is what makes the boot check actually pend —
    // with no token the bootstrap finishes synchronously (logged-out path).
    storeRefreshToken('in-flight-refresh-token');
    refreshSessionRequestMock.mockReturnValue(new Promise(() => undefined)); // never resolves
    renderAt('/schedule');
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session…');
    expect(screen.queryByText('Landing page')).not.toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });

  it('restores the session from the persisted refresh token and stays on the protected page', async () => {
    storeRefreshToken('persisted-refresh-token');
    refreshSessionRequestMock.mockResolvedValue({ accessToken: 'fresh-access-token', user: RESTORED_USER });
    renderAt('/schedule');
    expect(await screen.findByText('Schedule content')).toBeInTheDocument();
    expect(refreshSessionRequestMock).toHaveBeenCalledWith('persisted-refresh-token');
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toMatchObject({ email: 'chair@faciload.local', role: 'CHAIR' });
    expect(state.accessToken).toBe('fresh-access-token');
    expect(state.isInitializing).toBe(false);
  });

  it('redirects to /login when no refresh token is stored (logged out)', async () => {
    renderAt('/schedule');
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(refreshSessionRequestMock).not.toHaveBeenCalled();
  });

  it('clears stale state and redirects to /login when the refresh token is expired/invalid', async () => {
    storeRefreshToken('expired-refresh-token');
    refreshSessionRequestMock.mockRejectedValue(Object.assign(new Error('Session expired'), { status: 401 }));
    renderAt('/schedule');
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.refreshToken).toBeNull();
    // The rejected token must not linger in localStorage either.
    expect(localStorage.getItem(REFRESH_STORAGE_KEY)).toBeNull();
  });

  it('keeps the persisted token on a network failure but still lands logged-out (no crash, no hang)', async () => {
    storeRefreshToken('good-token-server-down');
    refreshSessionRequestMock.mockRejectedValue(new TypeError('Failed to fetch'));
    renderAt('/schedule');
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isInitializing).toBe(false);
    // Token survives for a later successful reload.
    expect(localStorage.getItem(REFRESH_STORAGE_KEY)).toBe('good-token-server-down');
  });
});
