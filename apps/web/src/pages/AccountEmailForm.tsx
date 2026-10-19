import { useState, type FormEvent } from 'react';
import { updateMe } from '../lib/dashboard';
import { useAuthStore } from '../store/auth.store';
import { useToast } from '../components/Toast';

export const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15';

/** Editable email for the signed-in account (current password required). */
export function EmailForm(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { pushToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const next = email.trim();
    if (!next) {
      setError('Enter a new email address.');
      return;
    }
    if (!password) {
      setError('Enter your current password to confirm.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await updateMe({ email: next, current_password: password });
      setUser({ ...res.user });
      setEmail('');
      setPassword('');
      pushToast('success', 'Email updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update email.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card overflow-hidden p-0">
      <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-3.5">
        <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-faciload-100 text-faciload-700">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Change email</h2>
          <p className="mt-0.5 text-xs text-slate-500">Update the address you sign in with.</p>
        </div>
      </div>

      <div className="space-y-3 p-5">
        <div>
          <label htmlFor="account-email" className="text-xs text-slate-500">New email</label>
          <input id="account-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={user?.email ?? 'you@faciload.local'} className={inputCls} />
        </div>
        <div>
          <label htmlFor="account-email-password" className="text-xs text-slate-500">Current password (to confirm)</label>
          <input id="account-email-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        </div>
        {error ? (<p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>) : null}
        <button type="submit" disabled={busy} className="w-full rounded-xl bg-gradient-to-r from-faciload-600 to-faciload-800 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-faciload-800/20 transition-opacity hover:opacity-95 disabled:opacity-50">
          {busy ? 'Saving…' : 'Save email'}
        </button>
      </div>
    </form>
  );
}
