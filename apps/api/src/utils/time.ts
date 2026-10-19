/**
 * Time-of-day helpers shared by ScheduleSlot validation, the conflict
 * service, and the dashboard.
 *
 * `ScheduleSlot.start_time` / `end_time` are plain `String` columns (SQLite
 * has no native TIME type) storing canonical "HH:MM" 24-hour wall-clock
 * values — the same format that crosses the API boundary, so no Date
 * conversion happens anywhere. (Before the SQLite migration these were
 * PostgreSQL `time` columns Prisma handed back as epoch-day Dates.)
 */

/** Matches "HH:MM" / "HH:MM:SS" in 24-hour clock form. */
export const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

/**
 * Canonical "HH:MM" storage form for a validated time-of-day string: pads
 * the hour and drops an optional ":SS". Callers must validate the format
 * first (validation/schedule-slot.validation.ts) — an unparseable string
 * would otherwise be stored verbatim and break overlap comparisons.
 */
export function parseTimeOfDay(value: string): string {
  const [hours = '0', minutes = '0'] = value.split(':');
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
}

/** Stored/requested "HH:MM[:SS]" value → canonical "HH:MM" (idempotent). */
export function formatTimeOfDay(value: string): string {
  return parseTimeOfDay(value);
}

/** "07:00" → "7:00 AM" for human-readable conflict messages. */
export function humanizeTimeOfDay(value: string): string {
  const [hours = '0', minutes = '00'] = value.split(':');
  const hour = Number(hours);
  const suffix = hour < 12 ? 'AM' : 'PM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${minutes} ${suffix}`;
}

/** Minutes since midnight for a validated "HH:MM" string. */
export function timeOfDayToMinutes(value: string): number {
  const [hours = '0', minutes = '0'] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/**
 * Reserved lunch break (Mon–Sat, 12:00 PM – 1:00 PM). No class may be
 * scheduled during this window — see schedule-slot.service.ts, which rejects
 * any placement overlapping it, and the web grid, which renders it as a
 * non-droppable band.
 */
export const LUNCH_BREAK_START_MINUTES = 12 * 60;
export const LUNCH_BREAK_END_MINUTES = 13 * 60;

/** True when [startMinutes, endMinutes) touches the lunch window. */
export function overlapsLunchBreak(startMinutes: number, endMinutes: number): boolean {
  return startMinutes < LUNCH_BREAK_END_MINUTES && endMinutes > LUNCH_BREAK_START_MINUTES;
}