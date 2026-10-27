import { useMemo } from 'react';
import type { DayOfWeek } from '../../lib/schedule-slots';
import type { OtherFunctionType } from '../../lib/other-function-sessions';
import {
  DAY_LABELS,
  formatTime12h,
  LUNCH_BREAK_END_MINUTES,
  LUNCH_BREAK_START_MINUTES,
  timeToMinutes,
} from '../../pages/Schedule/schedule-time';

export type ClassProgramVariant = 'faculty' | 'master';

export interface ClassProgramSlot {
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  subject_code: string;
  subject_title: string;
  section_name?: string;
  faculty_name: string;
  room_name: string | null;
  color: string | null;
  otherFunctionType?: OtherFunctionType;
  otherFunctionSessionId?: string;
  designationName?: string;
  designationSessionId?: string;
}

export interface ClassProgramTimetableProps {
  slots: ClassProgramSlot[];
  variant?: ClassProgramVariant;
  showLunchBreak?: boolean;
  onDeleteOtherFunction?: (sessionId: string) => void;
  onDeleteDesignationSession?: (sessionId: string) => void;
}

/**
 * The official form's six columns: the time gutter plus MON-FRI, exactly as
 * INSTRUCTORS-CLASS-PROGRAM-SEM2-2026-2027.xls lays them out (cols A-F).
 */
const DAY_COLUMNS: Array<{ day: DayOfWeek; label: string }> = [
  { day: 'MON', label: 'MONDAY' },
  { day: 'TUE', label: 'TUESDAY' },
  { day: 'WED', label: 'WEDNESDAY' },
  { day: 'THU', label: 'THURSDAY' },
  { day: 'FRI', label: 'FRIDAY' },
];

const DAY_START_HOUR = 7;
const DAY_END_HOUR = 19;

/** Letter-spaced lunch text, identical to the Excel export's merged band. */
const LUNCH_BAND_TEXT = 'L  U  N  C  H     B  R  E  A  K';

interface GridRow {
  /** Minutes from midnight this half-hour row starts (null = merged lunch). */
  start: number | null;
  label: string;
}

/** One drawn cell: every class in an overlapping cluster + its row span. */
interface Cluster {
  start: number;
  end: number;
  slots: ClassProgramSlot[];
}

interface DayCell {
  rowSpan: number;
  cluster: Cluster;
}

interface DayPlan {
  cells: Map<number, DayCell>;
  covered: Set<number>;
}

/** "7:00" / "12:00" — 12-hour without a meridiem, the way the form writes it. */
function clockLabel(totalMinutes: number): string {
  const hour24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')}`;
}

/**
 * The 23 official grid rows: 7:00-12:00 in half hours, the merged lunch hour
 * (12:00 - 1:00), then 1:00-7:00 — the workbook's exact row sequence.
 */
function buildGridRows(showLunchBreak: boolean): GridRow[] {
  const rows: GridRow[] = [];
  const push = (start: number, end: number): void => {
    rows.push({ start, label: `${clockLabel(start)} - ${clockLabel(end)}` });
  };
  for (let m = DAY_START_HOUR * 60; m < LUNCH_BREAK_START_MINUTES; m += 30) {
    push(m, m + 30);
  }
  if (showLunchBreak) {
    rows.push({
      start: null,
      label: `${clockLabel(LUNCH_BREAK_START_MINUTES)} - ${clockLabel(LUNCH_BREAK_END_MINUTES)}`,
    });
  } else {
    for (let m = LUNCH_BREAK_START_MINUTES; m < LUNCH_BREAK_END_MINUTES; m += 30) {
      push(m, m + 30);
    }
  }
  for (let m = LUNCH_BREAK_END_MINUTES; m < DAY_END_HOUR * 60; m += 30) {
    push(m, m + 30);
  }
  return rows;
}

/** A slot can be drawn only inside the grid, on a form day, never across lunch. */
function isDrawable(slot: ClassProgramSlot): boolean {
  if (!DAY_COLUMNS.some((col) => col.day === slot.day_of_week)) return false;
  const start = timeToMinutes(slot.start_time);
  const end = timeToMinutes(slot.end_time);
  if (start < DAY_START_HOUR * 60 || end > DAY_END_HOUR * 60 || end <= start) {
    return false;
  }
  // The API rejects lunch overlaps; mirror the export and drop any strays.
  return !(start < LUNCH_BREAK_END_MINUTES && end > LUNCH_BREAK_START_MINUTES);
}

/**
 * Group overlapping slots of one day column into a single cell. The master
 * view shares a column between instructors, so two classes in the same period
 * must stack inside one cell instead of painting over each other.
 */
function clusterDay(slots: ClassProgramSlot[]): Cluster[] {
  const sorted = [...slots].sort(
    (a, b) =>
      timeToMinutes(a.start_time) - timeToMinutes(b.start_time) ||
      timeToMinutes(a.end_time) - timeToMinutes(b.end_time),
  );
  const clusters: Cluster[] = [];
  for (const slot of sorted) {
    const start = timeToMinutes(slot.start_time);
    const end = timeToMinutes(slot.end_time);
    const current = clusters[clusters.length - 1];
    if (current && start < current.end) {
      current.end = Math.max(current.end, end);
      current.slots.push(slot);
    } else {
      clusters.push({ start, end, slots: [slot] });
    }
  }
  return clusters;
}

/** Map one day's clusters onto grid rows: the first row of each cluster
 *  emits one cell spanning every half-hour row the cluster touches. */
function planDay(rows: GridRow[], slots: ClassProgramSlot[]): DayPlan {
  const cells = new Map<number, DayCell>();
  const covered = new Set<number>();
  for (const cluster of clusterDay(slots.filter(isDrawable))) {
    const range: number[] = [];
    rows.forEach((row, index) => {
      if (row.start === null || covered.has(index)) return;
      // Rows the cluster touches: [row start, row end) overlaps [start, end).
      if (row.start + 30 > cluster.start && row.start < cluster.end) {
        range.push(index);
      }
    });
    const first = range[0];
    if (first === undefined) continue;
    for (const index of range) covered.add(index);
    cells.set(first, { rowSpan: range.length, cluster });
  }
  return { cells, covered };
}

/** The lines the official block shows: subject, section, faculty, room. */
function blockLines(slot: ClassProgramSlot, variant: ClassProgramVariant): string[] {
  if (slot.otherFunctionType) {
    const typeLabel = {
      RESEARCH: 'Research',
      EXTENSION: 'Extension',
      IMP: 'IMP',
      CONSULTATION: 'Consultation',
    }[slot.otherFunctionType];
    return [slot.subject_title === typeLabel
      ? typeLabel
      : `${typeLabel}: ${slot.subject_title}`];
  }
  if (slot.designationName) {
    return [slot.subject_title === slot.designationName
      ? slot.designationName
      : `${slot.designationName}: ${slot.subject_title}`];
  }
  const lines: string[] = [slot.subject_code];
  if (variant === 'faculty') {
    lines.push(slot.section_name ?? '');
    lines.push(slot.room_name ?? 'TBA');
  } else {
    lines.push(slot.faculty_name);
    lines.push(slot.section_name ?? '');
    lines.push(slot.room_name ?? 'TBA');
  }
  return lines.filter(Boolean);
}

export function ClassProgramTimetable({
  slots,
  variant = 'faculty',
  showLunchBreak = true,
  onDeleteOtherFunction,
  onDeleteDesignationSession,
}: ClassProgramTimetableProps): JSX.Element {
  const rows = useMemo(() => buildGridRows(showLunchBreak), [showLunchBreak]);
  const dayPlans = useMemo(() => {
    const plans = new Map<DayOfWeek, DayPlan>();
    for (const { day } of DAY_COLUMNS) {
      plans.set(day, planDay(rows, slots.filter((slot) => slot.day_of_week === day)));
    }
    return plans;
  }, [slots, rows]);

  return (
    <div
      aria-label="Class program timetable"
      className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <table className="timetable-grid w-full min-w-[640px] table-fixed border-collapse text-black">
        <colgroup>
          <col style={{ width: '15%' }} />
          {DAY_COLUMNS.map((col) => (
            <col key={col.day} style={{ width: '17%' }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th
              scope="col"
              className="border border-black bg-white px-1 py-1 text-center text-[11px] font-bold"
            >
              TIME / PERIOD
            </th>
            {DAY_COLUMNS.map((col) => (
              <th
                key={col.day}
                scope="col"
                className="border border-black bg-white px-1 py-1 text-center text-[11px] font-bold"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) =>
            row.start === null ? (
              <tr key="lunch" className="h-6">
                <td className="whitespace-nowrap border border-black px-1 text-center text-[10px] font-semibold">
                  {row.label}
                </td>
                <td
                  colSpan={DAY_COLUMNS.length}
                  className="whitespace-pre border border-black px-1 text-center text-[11px] font-bold"
                >
                  {LUNCH_BAND_TEXT}
                </td>
              </tr>
            ) : (
              <tr key={row.start} className="h-6">
                <td className="whitespace-nowrap border border-black px-1 text-center text-[10px]">
                  {row.label}
                </td>

                {DAY_COLUMNS.map(({ day }) => {
                  const plan = dayPlans.get(day);
                  const cell = plan?.cells.get(rowIndex);
                  if (cell) {
                    const anchor = cell.cluster.slots[0];
                    const title = anchor
                      ? `${DAY_LABELS[day]} ${formatTime12h(anchor.start_time)}–${formatTime12h(
                          anchor.end_time,
                        )} · ${cell.cluster.slots
                          .map((slot) => slot.subject_title)
                          .join(' / ')}`
                      : undefined;
                    return (
                      <td
                        key={day}
                        rowSpan={cell.rowSpan}
                        title={title}
                        className="class-program-block border border-black px-1 py-0.5 align-middle text-center text-[10px] leading-tight"
                      >
                        {cell.cluster.slots.map((slot, slotIndex) => (
                          <div
                            key={`${slot.subject_code}-${slotIndex}`}
                            className={
                              slotIndex > 0 ? 'mt-1 border-t border-black/40 pt-1' : undefined
                            }
                          >
                            <div>
                              {blockLines(slot, variant).map((line, lineIndex) => (
                                <div key={lineIndex}>{line}</div>
                              ))}
                              {slot.otherFunctionSessionId && onDeleteOtherFunction && (
                                <button
                                  type="button"
                                  aria-label={`Delete ${slot.subject_title} session`}
                                  onClick={() => {
                                    const sessionId = slot.otherFunctionSessionId;
                                    if (sessionId) onDeleteOtherFunction(sessionId);
                                  }}
                                  className="no-print mt-1 rounded border border-rose-300 px-1 text-[9px] text-rose-700 hover:bg-rose-50"
                                >
                                  Remove
                                </button>
                              )}
                              {slot.designationSessionId && onDeleteDesignationSession && (
                                <button
                                  type="button"
                                  aria-label={`Delete ${slot.subject_title} designation session`}
                                  onClick={() => {
                                    const sessionId = slot.designationSessionId;
                                    if (sessionId) onDeleteDesignationSession(sessionId);
                                  }}
                                  className="no-print mt-1 rounded border border-rose-300 px-1 text-[9px] text-rose-700 hover:bg-rose-50"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </td>
                    );
                  }
                  if (plan?.covered.has(rowIndex)) return null;
                  return <td key={day} className="border border-black p-0.5" />;
                })}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}