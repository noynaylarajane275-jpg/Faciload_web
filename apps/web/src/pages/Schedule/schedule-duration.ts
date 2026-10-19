import type { SessionType } from '../../lib/schedule-slots';

/**
 * Chunk-duration math shared by the sidebar duration picker, the drag payload,
 * and the drop placement — kept pure so it can be unit-tested without DOM.
 *
 * The Chair picks how many hours of an assignment's remaining per-session-type
 * budget to place in one drag (e.g. 1.5 of a 3-hour lab). Half-hour steps were
 * chosen as the smallest unit because:
 *  - subject `lecture_hours` / `lab_hours` are DECIMAL(5,2) but the seeded IE
 *    catalog only ever uses whole/half hours (2h lectures, 3h labs);
 *  - the grid's droppable rows are whole hours, and `placementRange` floors
 *    drops at 0.5h — so anything finer than 0.5h cannot be dropped reliably;
 *  - Philippine university IE timetables (CHED) standardize on 30-minute
 *    granularity. If 15-minute blocks are ever needed, only `CHUNK_STEP_HOURS`
 *    (and the grid row height) need to change.
 */

/** Smallest placeable duration (hours) — matches `placementRange`'s 0.5h floor. */
export const MIN_CHUNK_HOURS = 0.5;

/** Stepper increment (hours). */
export const CHUNK_STEP_HOURS = 0.5;

/** Max hours placeable in one LECTURE block (single meeting cap). */
export const MAX_LECTURE_BLOCK_HOURS = 2;

/** Max hours placeable in one LAB block (single meeting cap). */
export const MAX_LAB_BLOCK_HOURS = 3;

/** Per-session-type single-meeting cap: LECTURE 2h, LAB 3h. */
export function blockCapFor(sessionType: SessionType): number {
  return sessionType === 'LECTURE' ? MAX_LECTURE_BLOCK_HOURS : MAX_LAB_BLOCK_HOURS;
}

/** Default picker duration: full remaining, capped to one meeting's worth. */
export function defaultChunkHours(remaining: number, sessionType: SessionType): number {
  return clampChunkHours(remaining, remaining, blockCapFor(sessionType));
}

/** Rounds to 2 decimals so Decimal(5,2) hour values never pick up float dust. */
export function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Clamps a requested duration to what the card can still place.
 * A value ≤ 0 (or non-numeric) is returned as 0 — the "invalid, dragging
 * disabled" marker the picker and the drop math both treat specially.
 * When `remaining` is itself below `MIN_CHUNK_HOURS` (e.g. a 0.25h tail), the
 * whole tail stays selectable so the card can always be fully cleared.
 *
 * `cap` is the per-block meeting cap (LECTURE 2h, LAB 3h): the picker never
 * offers more than one meeting's worth, even when the weekly remaining is
 * higher — the rest is placed as a second block.
 */
export function clampChunkHours(value: number, remaining: number, cap?: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  const budget = Math.max(0, roundHours(remaining));
  if (budget === 0) {
    return 0;
  }
  const limit = cap !== undefined ? Math.min(budget, cap) : budget;
  if (limit === 0) {
    return 0;
  }
  const min = Math.min(MIN_CHUNK_HOURS, limit);
  return roundHours(Math.max(min, Math.min(value, limit)));
}

/**
 * One stepper press: `delta` of ±CHUNK_STEP_HOURS, clamped to the remaining
 * budget. Two edge cases matter:
 *  - from the invalid 0 marker, "−" keeps it invalid (nothing to reduce) while
 *    "+" recovers the card to the 0.5h floor so it becomes draggable again;
 *  - a valid duration never steps *below* the 0.5h floor — it clamps there
 *    instead of silently clearing the card.
 */
export function stepChunkHours(value: number, delta: number, remaining: number, cap?: number): number {
  const valid = Number.isFinite(value) && value > 0;
  if (!valid && delta <= 0) {
    return 0;
  }
  const next = roundHours(
    (valid ? value : 0) + (delta > 0 ? CHUNK_STEP_HOURS : -CHUNK_STEP_HOURS),
  );
  return clampChunkHours(next < MIN_CHUNK_HOURS ? MIN_CHUNK_HOURS : next, remaining, cap);
}

/** "1.5" / "3" — rounds away float dust, no trailing ".0" on whole hours. */
export function formatHours(hours: number): string {
  return String(roundHours(hours));
}

/** True when the value is a legal drag duration (a 0 marker disables dragging). */
export function isChunkDurationValid(value: number, remaining: number, cap?: number): boolean {
  const clamped = clampChunkHours(value, remaining, cap);
  const limit = cap !== undefined ? Math.min(roundHours(remaining), cap) : roundHours(remaining);
  return clamped > 0 && clamped <= limit + 1e-9;
}

/** "LEC" / "LAB" badge text for a chunk card. */
export function chunkSessionBadge(sessionType: SessionType): string {
  return sessionType === 'LECTURE' ? 'LEC' : 'LAB';
}
