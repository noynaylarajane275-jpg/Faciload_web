import { apiAssetUrl } from '../../lib/api';
import { useState } from 'react';

/**
 * Avatar with a clean initials fallback: renders the uploaded photo when the
 * URL exists and loads, otherwise (or when the image 404s) the first letters
 * of the name on a leaf-green disc.
 */
export function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0]?.slice(0, 2) ?? '?').toUpperCase();
  return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
}

export function AvatarImage({
  src,
  name,
  size = 'md',
  className = '',
}: {
  src: string | null | undefined;
  name: string;
  /** Tailwind size preset for the disc. */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}): JSX.Element {
  const [broken, setBroken] = useState(false);
  const resolved = apiAssetUrl(src);
  const showImage = resolved !== null && !broken;
  const sizeCls = size === 'sm' ? 'h-7 w-7 text-[10px]' : size === 'lg' ? 'h-20 w-20 text-xl' : 'h-12 w-12 text-sm';
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-leaf-600 font-semibold text-white ${sizeCls} ${className}`}
    >
      {showImage ? (
        <img
          src={resolved}
          alt=""
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        initialsForName(name)
      )}
    </span>
  );
}
