import type { DayOfWeek } from '../../lib/schedule-slots';
import type { ScheduleViewSlot } from '../../lib/schedule-views';
import { HEX_COLOR_PATTERN, readableTextColor } from '../../lib/colors';
import {
  DAYS,
  DAY_END_HOUR,
  DAY_LABELS,
  DAY_START_HOUR,
  GRID_HEIGHT,
  HALF_HOUR_HEIGHT,
  HOUR_HEIGHT,
  formatTime12h,
  halfHourRows,
  rangeLabel,
  slotHeight,
  slotTop,
  timeToMinutes,
} from '../Schedule/schedule-time';

/**
 * Which secondary lines a block shows — mirroring what is readable at a
 * glance on each real paper form:
 *  - section view ("Student Class Program"):  subject + faculty + room;
 *  - faculty view ("Faculty Class Program"):  subject + section + room;
 *  - room view ("Classroom Utilization"):     subject + section + faculty
 *    (the room is the tab context, so its line carries the instructor).
 */
export type ScheduleGridViewVariant = 'section' | 'faculty' | 'room';

function blockLines(slot: ScheduleViewSlot, variant: ScheduleGridViewVariant): [string, string | null] {
  if (variant === 'section') {
    return [slot.faculty_name, slot.room_name ?? 'TBA'];
  }
  if (variant === 'faculty') {
    return [slot.section_name, slot.room_name ?? 'TBA'];
  }
  return [slot.section_name, slot.faculty_name];
}

/**
 * Read-only Mon–Sat time grid shared by the three schedule views. It reuses
 * the Schedule page's geometry (schedule-time.ts) and block styling, minus
 * every drag-and-drop affordance — these views only display what the
 * schedule already stores. Blocks are absolutely positioned by start/end
 * time, exactly like the editing grid, so the two always agree visually.
 */
export function WeeklyScheduleGrid({
  slots,
  variant,
}: {
  slots: ScheduleViewSlot[];
  variant: ScheduleGridViewVariant;
}): JSX.Element {
  const hours = Array.from(
    { length: DAY_END_HOUR - DAY_START_HOUR },
    (_, index) => DAY_START_HOUR + index,
  );
  // The gutter labels each half-hour row with its full start - end span.
  const rows = halfHourRows();

  // The API sorts by day then time; regroup per day column and keep the
  // within-day time order defensively (cheap, and makes rendering stable).
  const slotsByDay = new Map<DayOfWeek, ScheduleViewSlot[]>();
  for (const slot of slots) {
    const bucket = slotsByDay.get(slot.day_of_week) ?? [];
    bucket.push(slot);
    slotsByDay.set(slot.day_of_week, bucket);
  }
  for (const bucket of slotsByDay.values()) {
    bucket.sort(
      (a, b) =>
        timeToMinutes(a.start_time) - timeToMinutes(b.start_time) ||
        timeToMinutes(a.end_time) - timeToMinutes(b.end_time),
    );
  }

  return (
    <div
      aria-label="Weekly schedule grid"
      className="overflow-x-auto rounded-2xl border border-leaf-100 bg-white p-4 shadow-sm"
    >
      {/* `flex-1` on the inner row keeps the day columns filling the panel. */}
      <div className="flex min-w-full flex-1">
        {/* Same half-hour range labels as the editing grid, so the two read as
            one surface. `whitespace-nowrap` stops the range wrapping onto two
            lines and drifting out of alignment with its row. */}
        {/* Wide enough for the longest label, the 11:30 AM - 12:00 PM row. */}
        <div className="w-[124px] shrink-0 pt-7 pr-3" aria-hidden="true">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex items-center justify-end whitespace-nowrap text-right font-mono text-[11px] leading-none tabular-nums text-ink/70"
              style={{ height: HALF_HOUR_HEIGHT }}
            >
              {rangeLabel(row)}
            </div>
          ))}
        </div>
        {DAYS.map((day) => (
          <div key={day} className="min-w-[132px] flex-1">
            <div className="pb-1 text-center text-xs font-semibold uppercase tracking-wide text-ink/60">
              {DAY_LABELS[day]}
            </div>
            {/* Same line weights as the editing grid in SchedulePage.tsx, so the
                read-only views and the editor read as one surface. */}
            <div className="relative border-l border-leaf-300" style={{ height: GRID_HEIGHT }}>
              {hours.map((hour) => (
                <div key={hour} className="border-b border-leaf-200" style={{ height: HOUR_HEIGHT }} />
              ))}
              {(slotsByDay.get(day) ?? []).map((slot, index) => {
                const start = timeToMinutes(slot.start_time);
                const end = timeToMinutes(slot.end_time);
                const [line1, line2] = blockLines(slot, variant);
                // Custom assignment color (Part 3) with a readable text color;
                // null keeps the default leaf block untouched.
                const custom =
                  slot.color && HEX_COLOR_PATTERN.test(slot.color) ? slot.color : null;
                const customText = custom ? readableTextColor(custom) : null;
                return (
                  <div
                    key={`${day}-${slot.start_time}-${slot.subject_code}-${index}`}
                    title={`${DAY_LABELS[day]} ${formatTime12h(slot.start_time)}–${formatTime12h(slot.end_time)} · ${slot.subject_title}`}
                    className={`absolute left-1 right-1 overflow-hidden rounded-lg border p-2 shadow-sm ${
                      custom ? '' : 'border-leaf-300 bg-leaf-50/90'
                    }`}
                    style={{
                      top: slotTop(start),
                      height: slotHeight(start, end),
                      ...(custom
                        ? { backgroundColor: custom, borderColor: custom, color: customText ?? undefined }
                        : {}),
                    }}
                  >
                    <p className={`truncate text-xs font-semibold ${custom ? '' : 'text-ink'}`}>{slot.subject_code}</p>
                    <p className={`truncate text-[11px] ${custom ? 'opacity-75' : 'text-ink/60'}`}>{line1}</p>
                    {line2 ? (
                      <p className={`truncate text-[11px] font-medium ${custom ? 'opacity-80' : 'text-leaf-700'}`}>{line2}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
