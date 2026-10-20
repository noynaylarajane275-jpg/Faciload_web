import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { logoutRequest } from '../lib/api';

/** Awaiting-approval screen for self-registered accounts (faculty_id null). */
export function PendingApprovalPage(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  // Linked accounts (or management) never sit here — send them onward.
  useEffect(() => {
    if (isInitializing) return;
    if (!isAuthenticated || !user) {
      navigate('/login', { replace: true });
      return;
    }
    if (user.role !== 'FACULTY' || user.facultyId) {
      navigate(user.role === 'FACULTY' ? '/workload' : '/dashboard', { replace: true });
    }
  }, [isInitializing, isAuthenticated, user, navigate]);

  async function handleSignOut(): Promise<void> {
    const refreshToken = useAuthStore.getState().refreshToken;
    await logoutRequest(refreshToken);
    logout();
    navigate('/', { replace: true });
  }

  return (
    <div className="mesh-gradient flex min-h-screen items-center justify-center px-4 font-jakarta">
      <section aria-labelledby="pending-title" className="glass-panel w-full max-w-md rounded-3xl p-8 text-center shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-faciload-600">Account created</p>
        <h1 id="pending-title" className="mt-2 text-2xl font-extrabold text-faciload-900">
          Awaiting faculty approval
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Your account <span className="font-semibold text-slate-800">{user?.email ?? ''}</span> is registered but not
          linked to a faculty record yet. The department chair will connect it in Faculty Management — then your
          schedule and workload unlock automatically on your next sign in.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            to="/account"
            className="rounded-xl border border-faciload-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-faciload-800 hover:bg-white"
          >
            Go to account settings
          </Link>
          <button
            type="button"
            onClick={() => { void handleSignOut(); }}
            className="rounded-xl bg-faciload-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-faciload-900"
          >
            Sign out
          </button>
        </div>
      </section>
    </div>
  );
}
