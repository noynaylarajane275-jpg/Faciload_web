/**
 * Custom per-assignment colors (Part 3). One hex per WorkloadAssignment,
 * shared by its LECTURE and LAB chunks. Null/undefined falls back to the
 * session-type defaults so existing schedules render exactly as before.
 */

/** Curated preset palette: black → dark-red family first, then distinct accents. */
export const COLOR_PRESETS: readonly { label: string; hex: string }[] = [
  { label: 'Flame', hex: '#B91C3C' },
  { label: 'Ember', hex: '#FF6A5E' },
  { label: 'Rose', hex: '#E63E5C' },
  { label: 'Amber', hex: '#D97706' },
  { label: 'Red', hex: '#DC2626' },
  { label: 'Purple', hex: '#7C3AED' },
  { label: 'Teal', hex: '#0D9488' },
  { label: 'Pink', hex: '#DB2777' },
  { label: 'Slate', hex: '#475569' },
] as const;

export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/**
 * Dark text on light backgrounds, white on dark ones — simple relative
 * luminance check (WCAG-style sRGB weights) with a 0.55 threshold, chosen so
 * every preset lands on the readable side.
 */
export function readableTextColor(hex: string): '#10241A' | '#FFFFFF' {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? '#10241A' : '#FFFFFF';
}

/**
 * The display color for an assignment's cards/blocks: the custom hex when set,
 * otherwise the shared default (session-type variants tint it per card).
 */
export function assignmentColor(assignment: { color?: string | null }): string {
  if (assignment.color && HEX_COLOR_PATTERN.test(assignment.color)) {
    return assignment.color;
  }
  return '#FFE3E8'; // soft rose — the long-standing default block background
}
