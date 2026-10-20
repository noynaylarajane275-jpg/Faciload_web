import { Navigate, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useAuthStore, type AuthRole } from '../store/auth.store';

interface RequireAuthProps {
  children: ReactElement;
  allowedRoles?: AuthRole[];
}

/** Lightweight full-screen spinner shown while the boot session check runs. */
function SessionLoading(): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-surface-muted"
    >
      <span className="sr-only">Checking your session…</span>
      <svg
        aria-hidden="true"
        className="h-8 w-8 animate-spin text-primary"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
      </svg>
    </div>
  );
}

/**
 * Frontend route guard. Unauthenticated users go to /login; authenticated
 * users whose role is not in allowedRoles go to /not-authorized.
 *
 * While the boot-time session check (SessionBootstrap) is still in flight the
 * redirect decision is postponed: a hard reload resets the in-memory auth
 * state, and redirecting before the refresh round-trip completes would kick
 * an authenticated user to Landing. Show a spinner until the check resolves.
 */
export function RequireAuth({ children, allowedRoles }: RequireAuthProps): ReactElement {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (isInitializing) {
    return <SessionLoading />;
  }
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/not-authorized" replace />;
  }
  // Self-registered FACULTY accounts with no linked faculty record may only
  // visit the awaiting-approval + account screens — never data pages.
  if (user.role === 'FACULTY' && !user.facultyId && location.pathname !== '/pending-approval' && location.pathname !== '/account') {
    return <Navigate to="/pending-approval" replace />;
  }
  return children;
}
