import { useCallback } from 'react';
import { ProfileCard } from '../components/dashboard/ProfileCard';
import { uploadAvatar } from '../lib/dashboard';
import { useAuthStore } from '../store/auth.store';
import { selectSelectedTerm, useTermStore } from '../store/term.store';
import { EmailForm } from './AccountEmailForm';
import { PasswordForm } from './AccountPasswordForm';

/**
 * Account Settings — profile photo, editable email, and password change.
 * Credential edits require the current password (server re-verifies it).
 */
export function AccountSettingsPage(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const setAvatarUrl = useAuthStore((s) => s.setAvatarUrl);
  const term = useTermStore(selectSelectedTerm);

  const handleUpload = useCallback(
    async (file: File) => {
      const res = await uploadAvatar(file);
      setAvatarUrl(res.avatar_url);
    },
    [setAvatarUrl],
  );

  return (
    <section aria-labelledby="account-title" className="space-y-6">
      <div>
        <p className="font-jakarta text-xs font-bold uppercase tracking-widest text-faciload-600">
          Settings
        </p>
        <h1 id="account-title" className="font-jakarta mt-1 text-2xl font-extrabold tracking-tight text-slate-900">
          Account configuration
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage how you appear across FACILOAD.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ProfileCard user={user} termLabel={term?.label ?? null} onUpload={handleUpload} />

        <div className="min-w-0 space-y-5">
          {/* Read-only account facts */}
          <div className="glass-card overflow-hidden p-0">
            <div className="border-b border-slate-200 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-slate-900">Account details</h2>
              <p className="mt-0.5 text-xs text-slate-500">Your fixed profile facts.</p>
            </div>
            <dl className="divide-y divide-slate-100 text-sm">
              <div className="flex items-center justify-between gap-3 px-5 py-3">
                <dt className="text-slate-500">Email</dt>
                <dd className="truncate font-mono text-xs text-slate-900">{user?.email ?? '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-5 py-3">
                <dt className="text-slate-500">Role</dt>
                <dd className="text-xs font-semibold text-slate-900">{user?.role ?? '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-5 py-3">
                <dt className="text-slate-500">Working term</dt>
                <dd className="text-xs text-slate-900">{term?.label ?? 'No active term'}</dd>
              </div>
            </dl>
          </div>

          <EmailForm />
          <PasswordForm />
        </div>
      </div>
    </section>
  );
}

