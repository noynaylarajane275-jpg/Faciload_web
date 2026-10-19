import { useRef, useState, type ChangeEvent } from 'react';
import { AvatarImage } from './AvatarImage';
import { validateAvatarFile } from '../../lib/dashboard';
import type { AuthUser } from '../../store/auth.store';

export const ROLE_LABELS: Record<AuthUser['role'], string> = {
  CHAIR: 'Program Chair',
  FACULTY: 'Faculty',
  ACADEMIC_ADMIN: 'Academic Admin',
};

/** Derive a display name from the login email (chair accounts have no faculty record). */
export function displayNameForUser(user: Pick<AuthUser, 'email'> | null): string {
  if (!user?.email) return 'There';
  const local = user.email.split('@')[0] ?? '';
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return 'There';
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * ProfileCard — the account "identity hero": a bold rose→dark-red gradient
 * panel (echoing the app sidebar) holding the large avatar, display name, role
 * chip, working term, and the "Change photo" affordance. Sits as the sticky
 * left column of Account Settings. The upload itself is shared: the parent
 * performs it via uploadAvatar() and updates the store.
 */
export function ProfileCard({
  user,
  termLabel,
  onUpload,
}: {
  user: AuthUser | null;
  termLabel: string | null;
  onUpload?: (file: File) => Promise<void>;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = displayNameForUser(user);
  const canUpload = typeof onUpload === 'function';

  async function handleChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file || !onUpload) return;
    const problem = validateAvatarFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      await onUpload(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed — try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-black/10 bg-gradient-to-br from-[#c81e42] via-[#8c1128] to-[#4a0a16] p-6 text-center shadow-[18px_18px_44px_-28px_rgba(74,10,22,0.9)] lg:sticky lg:top-6">
      {/* decorative glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl"
      />
      <div className="relative flex flex-col items-center">
        <AvatarImage
          src={user?.avatar_url ?? null}
          name={name}
          size="lg"
          className="ring-4 ring-white/25"
        />
        <p className="mt-4 max-w-full truncate text-xl font-bold text-white">{name}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/25">
            {user ? ROLE_LABELS[user.role] : '—'}
          </span>
          {termLabel ? (
            <span className="rounded-full border border-white/25 px-2.5 py-1 font-mono text-[11px] text-white/80">
              {termLabel}
            </span>
          ) : null}
        </div>

        {canUpload ? (
          <div className="mt-5 w-full">
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="w-full rounded-xl bg-white/90 px-4 py-2.5 text-sm font-semibold text-faciload-900 shadow-sm transition-colors hover:bg-white disabled:opacity-60"
            >
              {uploading ? 'Uploading…' : 'Change photo'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleChange}
              aria-label="Change profile photo"
            />
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 text-xs font-medium text-rose-100">
            {error}
          </p>
        ) : (
          <p className="mt-4 text-[11px] leading-relaxed text-white/60">
            JPG, PNG or WebP · up to 2MB
          </p>
        )}
      </div>
    </div>
  );
}
