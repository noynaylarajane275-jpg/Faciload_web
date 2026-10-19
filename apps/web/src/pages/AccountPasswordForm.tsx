import { useState, type FormEvent } from 'react';
import { updateMe } from '../lib/dashboard';
import { useToast } from '../components/Toast';
import { inputCls } from './AccountEmailForm';

/** Password change for the signed-in account (current password required). */
export function PasswordForm(): JSX.Element {
  const { pushToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!currentPassword) {
      setError('Enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await updateMe({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      pushToast('success', 'Password changed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card overflow-hidden p-0">
      <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-3.5">
        <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-faciload-100 text-faciload-700">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Change password</h2>
          <p className="mt-0.5 text-xs text-slate-500">Use at least 8 characters.</p>
        </div>
      </div>

      <div className="space-y-3 p-5">
        <div>
          <label htmlFor="account-current-password" className="text-xs text-slate-500">Current password</label>
          <input id="account-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="account-new-password" className="text-xs text-slate-500">New password (min 8 characters)</label>
          <input id="account-new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="account-confirm-password" className="text-xs text-slate-500">Confirm new password</label>
          <input id="account-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} />
        </div>
        {error ? (<p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>) : null}
        <button type="submit" disabled={busy} className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-slate-900/20 transition-opacity hover:opacity-95 disabled:opacity-50">
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </div>
    </form>
  );
}
