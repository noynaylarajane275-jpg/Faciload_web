/**
 * The school seal URL. Tries the public assets in order so a missing asset
 * degrades gracefully rather than showing a broken image.
 *
 * The public folder is served at the site root (e.g. /school-logo.jpg).
 * The Excel export reads the same candidates.
 */
export const SCHOOL_LOGO_CANDIDATES = [
  '/school-logo.png',
  '/school-logo.jpg',
  '/school-logo.jpeg',
  '/logo.png',
  '/logo.jpg',
] as const;

/** Return the first candidate URL (caller handles 404 gracefully). */
export function schoolLogoUrl(): string | null {
  return SCHOOL_LOGO_CANDIDATES[0] ?? null;
}