import type { DayOfWeek } from '../../lib/schedule-slots';

/** Grid geometry shared by the droppable cells and the placed-block math. */
export const DAYS: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const DAY_LABELS: Record<DayOfWeek, string> = {
  MON: 'Mon',
  TUE: 'Tue',
  WED: 'Wed',
  THU: 'Thu',
  FRI: 'Fri',
  SAT: 'Sat',
};

/** Grid runs 7AM → 8PM (the last droppable half-hour cell starts at 7:30PM). */
export const DAY_START_HOUR = 7;
export const DAY_END_HOUR = 20;
/**
 * Pixels per hour row — the whole grid's top/height math derives from this.
 * Taller than a typical calendar hour (24px): these blocks carry three lines of
 * text (subject / section / instructor) and the Chair drags them around, so the
 * extra room is what makes the grid readable rather than cramped.
 */
export const HOUR_HEIGHT = 64;
export const HALF_HOUR_HEIGHT = HOUR_HEIGHT / 2;
export const GRID_HEIGHT = (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT;

/** Offsets within an hour: 0 = :00, 1 = :30. */
export type HalfHourOffset = 0 | 1;

/** Droppable ids are `cell:<DAY>:<hour>:<offset>` so both pointer and keyboard
 *  drops resolve to a specific half-hour slot. `offset` is 0 (:00) or 1 (:30). */
export function cellId(day: DayOfWeek, hour: number, offset: HalfHourOffset = 0): string {
  return `cell:${day}:${hour}:${offset}`;
}

export function parseCellId(id: string): { day: DayOfWeek; hour: number; offset: HalfHourOffset } | null {
  if (!id.startsWith('cell:')) {
    return null;
  }
  const parts = id.split(':');
  if (parts.length !== 4) {
    return null;
  }
  const [, day, hourStr, offsetStr] = parts;
  const hourNum = Number(hourStr);
  const offsetNum = Number(offsetStr);
  if (!DAYS.includes(day as DayOfWeek)) {
    return null;
  }
  if (!Number.isInteger(hourNum) || hourNum < DAY_START_HOUR || hourNum >= DAY_END_HOUR) {
    return null;
  }
  if (offsetNum !== 0 && offsetNum !== 1) {
    return null;
  }
  return { day: day as DayOfWeek, hour: hourNum, offset: offsetNum as HalfHourOffset };
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/** "14:30" → "2:30 PM" for block labels. */
export function formatTime12h(time: string): string {
  const total = timeToMinutes(time);
  const h24 = Math.floor(total / 60);
  const mins = total % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mins).padStart(2, '0')} ${period}`;
}

/** Absolute `top` (px) of a block inside its day column. */
export function slotTop(startMinutes: number): number {
  return ((startMinutes - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT;
}

/** Absolute `height` (px); floored so short blocks stay grabbable. */
export function slotHeight(startMinutes: number, endMinutes: number): number {
  return Math.max(18, ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT);
}

export function hourLabel(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}

/**
 * Every half-hour row in the grid, in order — the axis the time gutter renders.
 * The gutter labels each of these with its full `start - end` span so a drop
 * target is unambiguous ("7:30 - 8:00 AM") rather than just the hour it starts in.
 */
export interface HalfHourRow {
  key: string;
  hour: number;
  offset: HalfHourOffset;
  start: string;
  end: string;
  /** `7:00` — 12-hour clock, the form a department timetable is read in. */
  startShort: string;
  endShort: string;
  /** `AM` / `PM` — shown once for the whole range, not on both ends. */
  period: string;
}

/** 12-hour clock hour for an "HH:MM" 24h string: "07:30" → 7. */
function to12hHour(time24: string): number {
  const h = Number(time24.split(':')[0]) ?? 0;
  return h % 12 === 0 ? 12 : h % 12;
}

/** 12-hour clock "H:MM" for an "HH:MM" 24h string: "07:30" → "7:30". */
function to12hTime(time24: string): string {
  const [, m] = time24.split(':');
  return `${to12hHour(time24)}:${String(Number(m ?? 0)).padStart(2, '0')}`;
}

export function halfHourRows(): HalfHourRow[] {
  const rows: HalfHourRow[] = [];
  for (let hour = DAY_START_HOUR; hour < DAY_END_HOUR; hour += 1) {
    for (const offset of [0, 1] as const) {
      const startMinutes = (hour + offset * 0.5) * 60;
      const endMinutes = startMinutes + 30;
      const start = minutesToTime(startMinutes);
      const end = minutesToTime(endMinutes);
      rows.push({
        key: `${hour}:${offset}`,
        hour,
        offset,
        start,
        end,
        // Both ends use the same 12h clock, and the AM/PM marker is carried once
        // on the row so the label can stay short enough not to wrap.
        startShort: to12hTime(start),
        endShort: to12hTime(end),
        period: Number(start.slice(0, 2)) >= 12 ? 'PM' : 'AM',
      });
    }
  }
  return rows;
}

/**
 * The two ends of a range on the 12-hour clock, split so a two-column label can
 * print them either side of the form's dash: `7:00` | `-` | `7:30 AM`.
 *
 * The meridiem is printed once when both ends agree, which keeps the common
 * label short enough not to wrap. When the range crosses noon or midnight the
 * single marker would be ambiguous ("11:30 - 12:00 AM" looks like a morning
 * slot, and "7:00 - 7:30 PM" is indistinguishable from the 7 AM row at a
 * glance), so both ends are marked in that one case.
 *
 * One function owns that rule for both readers of a range: the on-screen gutter
 * (`rangeLabel`) and the exported sheet's two time columns. Neither the grid nor
 * the printed form can drift into writing a time differently.
 */
export function timeRangeParts(start24: string, end24: string): { start: string; end: string } {
  const start = to12hTime(start24);
  const end = to12hTime(end24);
  // Same meridiem on both ends (the common case) → print it once, keeps the
  // label short. Different → print both so the row is unambiguous.
  const startIsPm = Number(start24.slice(0, 2)) >= 12;
  const endIsPm = Number(end24.slice(0, 2)) >= 12;
  if (startIsPm === endIsPm) {
    return { start, end: `${end} ${endIsPm ? 'PM' : 'AM'}` };
  }
  return {
    start: `${start} ${startIsPm ? 'PM' : 'AM'}`,
    end: `${end} ${endIsPm ? 'PM' : 'AM'}`,
  };
}

/**
 * The gutter's per-row range label, e.g. `7:00 - 7:30 AM`, joined back from the
 * same split the sheet's two time columns print separately.
 */
export function rangeLabel(row: Pick<HalfHourRow, 'start' | 'end'>): string {
  const { start, end } = timeRangeParts(row.start, row.end);
  return `${start} - ${end}`;
}

/** Clamps a drop to the grid and snaps the end time to a half-hour boundary. */
export function placementRange(hour: number, offset: HalfHourOffset, durationHours: number): { start: string; end: string } {
  const startMinutes = (hour + offset * 0.5) * 60;
  const rawEnd = startMinutes + Math.max(0.5, durationHours) * 60;
  const endMinutes = Math.min(rawEnd, DAY_END_HOUR * 60);
  return { start: minutesToTime(startMinutes), end: minutesToTime(endMinutes) };
}

/**
 * Cell ids the drop preview highlights: the anchor half-hour cell plus however many
 * half-hour cells the dragged duration spans (1.5h → 3 cells, 0.5h → 1 cell, 3h → 6),
 * clamped to the grid's last half-hour — so the preview matches the placement.
 */
export function previewCellIds(
  dragHours: number,
  anchorDay: DayOfWeek,
  anchorHour: number,
  anchorOffset: HalfHourOffset,
): string[] {
  const span = Math.max(1, Math.ceil(Math.max(0, dragHours) * 2));
  const cells: string[] = [];
  for (let i = 0; i < span; i++) {
    const totalHalfHours = anchorOffset + i;
    const hour = anchorHour + Math.floor(totalHalfHours / 2);
    const off = totalHalfHours % 2 ? 1 : 0;
    if (hour < DAY_END_HOUR) {
      cells.push(cellId(anchorDay, hour, off));
    }
  }
  return cells;
}
