import type { DayOfWeek, ScheduleSlot } from './schedule-slots';
import {
  DAY_LABELS,
  minutesToTime,
  timeRangeParts,
  type HalfHourOffset,
} from '../pages/Schedule/schedule-time';

/**
 * Pure layout math for the Excel export — the "where does this block go on the
 * sheet" half of the feature, split from the exceljs writing so it can be
 * unit-tested without a workbook.
 *
 * The sheet mirrors the printed Classroom Utilization / Class Program form:
 * one row per half hour, one column per day, and a placed class occupying a
 * merged block that spans every half-hour row it covers.
 */

/** Rows are 1-based Excel row numbers; the data grid starts below the header. */
export interface ExportGridOptions {
  /** Excel row number of the first half-hour row (7:00). */
  firstRow: number;
}

/** One half-hour row of the sheet. */
export interface GridRow {
  row: number;
  hour: number;
  offset: HalfHourOffset;
  /** 0-based index of this row within the grid, used for merge extents. */
  index: number;
}

/** A class block resolved to a rectangle of cells on the sheet. */
export interface PlacedBlock {
  slot: ScheduleSlot;
  day: DayOfWeek;
  /** 1-based Excel row of the block's first (top) row. */
  topRow: number;
  /** 1-based Excel row of the block's last (bottom) row. */
  bottomRow: number;
  /** Number of half-hour rows the block covers. */
  rowSpan: number;
}

/**
 * Half-hour index from 0 for a given hour + offset, relative to the grid start.
 * Shared by the row builder and the block placer so they can never disagree
 * about which sheet row a time lands on.
 */
export function halfHourIndex(
  hour: number,
  offset: HalfHourOffset,
  startHour: number,
): number {
  return (hour - startHour) * 2 + offset;
}

/** Reverse of `halfHourIndex` — the time a given half-hour index represents. */
export function indexToTime(index: number, startHour: number): { hour: number; offset: HalfHourOffset } {
  const hour = startHour + Math.floor(index / 2);
  return { hour, offset: (index % 2) as HalfHourOffset };
}

/**
 * The half-hour rows of the sheet, in order.
 * `slotTop`-style math is deliberately NOT reused: the sheet's row numbers are
 * its own axis, anchored at `firstRow`.
 */
export function buildGridRows(
  startHour: number,
  endHour: number,
  { firstRow }: ExportGridOptions,
): GridRow[] {
  const rows: GridRow[] = [];
  let index = 0;
  for (let hour = startHour; hour < endHour; hour += 1) {
    for (const offset of [0, 1] as const) {
      rows.push({ row: firstRow + index, hour, offset, index });
      index += 1;
    }
  }
  return rows;
}

/**
 * Resolve one slot to the rectangle it occupies.
 *
 * Returns null when the slot falls outside the printed grid (e.g. a 7:00–20:00
 * sheet cannot show a block that starts before the first row), so a partially
 * clipped block is dropped rather than silently drawn in the wrong place.
 */
export function placeBlock(
  slot: ScheduleSlot,
  { firstRow }: ExportGridOptions,
  startHour: number,
  endHour: number,
): PlacedBlock | null {
  const [sh, sm] = slot.start_time.split(':').map(Number);
  const [eh, em] = slot.end_time.split(':').map(Number);
  const startMinutes = (sh ?? 0) * 60 + (sm ?? 0);
  const endMinutes = (eh ?? 0) * 60 + (em ?? 0);

  // Snap to the half-hour grid the sheet is drawn on.
  const startIndex = Math.max(0, Math.floor((startMinutes - startHour * 60) / 30));
  const endIndex = Math.ceil((endMinutes - startHour * 60) / 30);

  const lastIndex = (endHour - startHour) * 2 - 1;
  if (endIndex <= 0 || startIndex > lastIndex || endMinutes <= startMinutes) {
    return null;
  }

  const clampedStart = Math.min(startIndex, lastIndex);
  const clampedEnd = Math.min(Math.max(endIndex, clampedStart + 1), lastIndex + 1);

  return {
    slot,
    day: slot.day_of_week,
    topRow: firstRow + clampedStart,
    bottomRow: firstRow + clampedEnd - 1,
    rowSpan: clampedEnd - clampedStart,
  };
}

/**
 * Which blocks overlap an already-placed one in the same day column.
 *
 * The printed form has no notion of a conflict — it just paints cells. Two
 * classes in the same column and time range are a data problem, not a layout
 * one, so the caller decides what to do; this just reports them.
 */
export function findOverlaps(blocks: PlacedBlock[]): PlacedBlock[][] {
  const groups: PlacedBlock[][] = [];
  for (const block of blocks) {
    const clash = blocks.find(
      (other) =>
        other !== block &&
        other.day === block.day &&
        other.topRow <= block.bottomRow &&
        other.bottomRow >= block.topRow,
    );
    if (clash) {
      const existing = groups.find((g) => g.includes(clash));
      if (existing) {
        if (!existing.includes(block)) existing.push(block);
      } else {
        groups.push([clash, block]);
      }
    }
  }
  return groups;
}

/** Day column labels, in sheet order (Mon → Sat), for the header row. */
export function exportDayLabels(days: DayOfWeek[]): string[] {
  return days.map((day) => DAY_LABELS[day]);
}

// ---------------------------------------------------------------------------
// Workbook writing (exceljs)
// ---------------------------------------------------------------------------

/** Everything the sheet's header block needs, mirroring the printed form. */
export interface ExportHeader {
  title: string;
  subtitle: string;
  /**
   * The three institution lines printed to the right of the seal:
   * "Republic of the Philippines" / the school name / the campus location.
   */
  institution: string[];
  college: string;
  room: string;
  program: string;
  major: string;
  yearSection: string;
}

/**
 * Excel column indices, matching the printed form's gutter:
 * A = A.M./P.M., B–D = the time range ("7:00" "-" "7:30"), E… = one per day.
 * The dash gets its own narrow column because the form separates the two ends
 * of the range rather than writing "7:00 - 7:30" into a single cell.
 */
export const COL_AMPM = 1;
export const COL_TIME_START = 2;
export const COL_TIME_DASH = 3;
export const COL_TIME_END = 4;
export const COL_FIRST_DAY = 5;

const THIN = { style: 'thin' as const, color: { argb: 'FF000000' } };
const MEDIUM = { style: 'medium' as const, color: { argb: 'FF000000' } };

/**
 * The olive-green day/time header band of the printed form, with the darker
 * ink lettering it uses (not white — the fill is light enough that white text
 * would not carry).
 */
const HEADER_FILL = 'FF9BBB59';
/** Lighter green behind the A.M./P.M. gutter, as on the form. */
const LABEL_FILL = 'FFC6E0B4';

/**
 * Fixed height (points) for every half-hour row.
 *
 * Uniform on purpose: a 30-minute class and a 3-hour class must occupy the
 * same number of equal rows, or the printed grid stops lining up.
 */
const GRID_ROW_HEIGHT = 22;

/** `#B91C3C` → Excel's `FFB91C3C` ARGB form. */
export function toArgb(hex: string | null | undefined, fallback = 'FFFFE3E8'): string {
  if (!hex) return fallback;
  const value = hex.replace('#', '').trim();
  if (!/^[0-9A-Fa-f]{6}$/.test(value)) return fallback;
  return `FF${value.toUpperCase()}`;
}

/** White text on a dark fill, ink on a light one — mirrors the screen cards. */
export function textArgbFor(hex: string | null): string {
  if (!hex) return 'FF10241A';
  const value = hex.replace('#', '').trim();
  if (!/^[0-9A-Fa-f]{6}$/.test(value)) return 'FF10241A';
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? 'FF10241A' : 'FFFFFFFF';
}

/** An image already loaded into memory, ready to embed. */
export interface ExportImage {
  /** Raw image bytes, base64-encoded (no data: prefix). */
  base64: string;
  /** Format exceljs can embed. */
  extension: 'png' | 'jpeg' | 'gif';
}

/**
 * Sniff the real image format from its leading bytes.
 *
 * The filename cannot be trusted: saving a JPEG as "logo.png" is everyday, and
 * tagging JPEG bytes as PNG makes Excel refuse the picture with "The picture
 * can't be displayed". Reading the magic number instead means the export works
 * whatever the file is called. Returns null for anything unrecognised (e.g. a
 * webp, which exceljs cannot embed) so the caller simply omits the seal.
 */
export function sniffImageFormat(bytes: Uint8Array): ExportImage['extension'] | null {
  if (bytes.length >= 8) {
    // 89 50 4E 47 0D 0A 1A 0A — PNG
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return 'png';
    }
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (bytes.length >= 6) {
    // 47 49 46 38 — GIF
    const gif = [0x47, 0x49, 0x46, 0x38];
    if (gif.every((byte, i) => bytes[i] === byte)) return 'gif';
  }
  return null;
}

/**
 * Candidate paths for the school seal, tried in order.
 *
 * The file is a manual drop-in and there is no build step to enforce a name, so
 * a single hard-coded path fails silently whenever the file is saved under a
 * different name. Each candidate is attempted and the first that loads wins;
 * when none match the export simply carries no seal.
 */
export const SCHOOL_LOGO_CANDIDATES = [
  '/school-logo.png',
  '/school-logo.jpg',
  '/school-logo.jpeg',
  '/logo.png',
  '/logo.jpg',
  '/pseal.png',
  '/pseal.jpg',
];

/**
 * Fetch the first logo candidate that actually loads.
 *
 * Returns null if none are present, so a missing asset degrades to a logo-less
 * sheet rather than a failed export.
 */
export async function loadSchoolLogo(): Promise<ExportImage | null> {
  for (const url of SCHOOL_LOGO_CANDIDATES) {
    const image = await loadLogoFromUrl(url);
    if (image) return image;
  }
  return null;
}

/**
 * Fetch a logo and return it as embeddable base64.
 *
 * Returns null for any failure — a missing or unreadable asset must degrade to
 * "no logo", never to a failed export. Callers can pass the result straight
 * through as `logo`.
 */
export async function loadLogoFromUrl(url: string | null): Promise<ExportImage | null> {
  if (!url || typeof fetch !== 'function') return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (blob.size === 0) return null;
    const buffer = new Uint8Array(await blob.arrayBuffer());
    // The format comes from the bytes, never from the file name — see above.
    const extension = sniffImageFormat(buffer);
    if (!extension) return null;
    let binary = '';
    // Chunked to stay well under the argument limit of String.fromCharCode.
    const CHUNK = 0x2000;
    for (let i = 0; i < buffer.length; i += CHUNK) {
      binary += String.fromCharCode(...buffer.subarray(i, i + CHUNK));
    }
    return { base64: btoa(binary), extension };
  } catch {
    return null;
  }
}

/**
 * Place the school seal inside a given block of the sheet, as on the printed
 * form (top-left of the header). A no-op when no image was supplied.
 *
 * The seal is sized to the box it was given rather than to fixed pixels, so it
 * cannot spill over the title or the labels beside it. A square source image
 * keeps a square seal.
 */
export function placeLogo(
  wb: import('exceljs').Workbook,
  ws: import('exceljs').Worksheet,
  logo: ExportImage | null,
  box: { topRow: number; bottomRow: number; firstCol: number; lastCol: number },
): boolean {
  if (!logo) return false;
  const id = wb.addImage({ extension: logo.extension, base64: logo.base64 });

  // Column width in exceljs is in characters; ~7px per char at 11pt Calibri is
  // close enough for an 11pt Arial sheet. Row height is in points (×4/3 → px).
  const colPx = (col: number): number => Math.round((ws.getColumn(col).width ?? 8) * 7);
  const rowPx = (row: number): number => Math.round((ws.getRow(row).height ?? 15) * 4 / 3);
  const width = Array.from({ length: box.lastCol - box.firstCol + 1 }, (_, i) => colPx(box.firstCol + i)).reduce(
    (sum, px) => sum + px,
    0,
  );
  const height = Array.from(
    { length: box.bottomRow - box.topRow + 1 },
    (_, i) => rowPx(box.topRow + i),
  ).reduce((sum, px) => sum + px, 0);

  // A seal is square, so fit it inside the box rather than stretching it. The
  // previous `Math.min(height, width)` capped against a height that could be
  // smaller than the real one, shrinking the picture to a fraction of the cell.
  const size = Math.max(24, Math.min(height, width));
  ws.addImage(id, {
    tl: { col: box.firstCol - 1, row: box.topRow - 1 },
    ext: { width: size, height: size },
    editAs: 'oneCell',
  });
  return true;
}

/** "07:30" for a grid hour + half-hour offset: the 24-hour input the 12-hour
 *  range helper takes. Nothing prints this raw form. */
function to24h(hour: number, offset: HalfHourOffset): string {
  return minutesToTime(hour * 60 + offset * 30);
}

/**
 * Draw the form's box around the grid: a medium rule along the top and bottom
 * and down both sides, with every interior edge left as the thin cell border.
 *
 * Each edge cell's relevant side is rewritten rather than merged into one big
 * object, so an interior border that was already set is preserved.
 */
export function applyGridOutline(
  ws: {
    getCell: (row: number, col: number) => {
      border: unknown;
      style?: Record<string, unknown>;
    };
  },
  area: {
    headerRow: number;
    firstRow: number;
    lastRow: number;
    firstCol: number;
    lastCol: number;
  },
): void {
  const put = (row: number, col: number, side: 'top' | 'bottom' | 'left' | 'right'): void => {
    const cell = ws.getCell(row, col);
    cell.border = { ...(cell.border as object), [side]: MEDIUM };
  };
  // Top and bottom edges, spanning the full width.
  for (let col = area.firstCol; col <= area.lastCol; col += 1) {
    put(area.headerRow, col, 'top');
    put(area.headerRow, col, 'bottom');
    put(area.lastRow, col, 'bottom');
  }
  // Left and right edges, from the header down to the last grid row.
  for (let row = area.headerRow; row <= area.lastRow; row += 1) {
    put(row, area.firstCol, 'left');
    put(row, area.lastCol, 'right');
  }
}

/**
 * Draw a medium box around an arbitrary block of cells, leaving every interior
 * edge as it was. Used to frame the header block and the signature row.
 */
export function applyBox(
  ws: {
    getCell: (row: number, col: number) => { border: unknown };
  },
  area: { firstRow: number; lastRow: number; firstCol: number; lastCol: number },
): void {
  const put = (row: number, col: number, side: 'top' | 'bottom' | 'left' | 'right'): void => {
    const cell = ws.getCell(row, col);
    cell.border = { ...(cell.border as object), [side]: MEDIUM };
  };
  for (let col = area.firstCol; col <= area.lastCol; col += 1) {
    put(area.firstRow, col, 'top');
    put(area.lastRow, col, 'bottom');
  }
  for (let row = area.firstRow; row <= area.lastRow; row += 1) {
    put(row, area.firstCol, 'left');
    put(row, area.lastCol, 'right');
  }
}

/**
 * Outline every row of a block individually.
 *
 * The printed form boxes each field line — College, Room, Program, Major,
 * Yr/Sec — rather than drawing one large frame around the whole header. Calling
 * this over rows 1-6 therefore produces a separate outline per row, so the
 * title, the subtitle and each field line all read as distinct cells.
 *
 * Left as a loop over `applyBox` so the medium-rule logic stays in one place.
 */
export function applyRowOutlines(
  ws: Parameters<typeof applyBox>[0],
  area: { firstRow: number; lastRow: number; firstCol: number; lastCol: number },
): void {
  for (let row = area.firstRow; row <= area.lastRow; row += 1) {
    applyBox(ws, { ...area, firstRow: row, lastRow: row });
  }
}

/**
 * The text inside a block. The printed form shows the subject title, and adds
 * the instructor on lab blocks the way the hand-filled sheets do.
 */
function blockText(slot: ScheduleSlot): string {
  const base = slot.subject_title || slot.subject_code;
  return slot.session_type === 'LAB' ? `${base}\n${slot.faculty_name}` : base;
}

/**
 * Build the workbook. Separated from the download plumbing so a test (or a
 * future "email this" flow) can grab the buffer without touching the DOM.
 */
export async function buildScheduleWorkbook(opts: {
  header: ExportHeader;
  slots: ScheduleSlot[];
  days: DayOfWeek[];
  startHour: number;
  endHour: number;
  /** Live assignment color for a slot — the same one painted on the grid. */
  colorFor: (slot: ScheduleSlot) => string | null;
  /** Absolute path to the school logo, or null to export without one. */
  logo?: ExportImage | null;
}): Promise<Uint8Array> {
  const { header, slots, days, startHour, endHour, colorFor, logo = null } = opts;
  // exceljs ships CommonJS. Depending on the bundler/runtime, a dynamic import
  // hands back either the module namespace or the module itself under
  // `default`, so unwrap defensively — vitest resolves one shape and Vite in
  // the browser can hand over the other, and `new Workbook()` throws
  // "not a constructor" if you pick the wrong one.
  const excelModule = await import('exceljs');
  const ExcelJS = (
    (excelModule as { default?: { Workbook?: unknown } }).default ?? excelModule
  ) as { Workbook: new () => import('exceljs').Workbook };
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Schedule', {
    // Freeze the header block and the time gutter, as the form's print layout
    // implies: the day columns and rows stay put while scrolling.
    views: [{ state: 'frozen', xSplit: COL_TIME_END, ySplit: 8 }],
    pageSetup: {
      // The form is printed on portrait paper, and the content is centred on
      // the page both ways — `horizontalCentered`/`verticalCentered` are the
      // print settings for that, and they only take effect alongside fitToPage.
      orientation: 'portrait',
      horizontalCentered: true,
      verticalCentered: true,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9, // A4
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
    },
  });

  const gridOptions: ExportGridOptions = { firstRow: 9 };
  const dayCount = days.length;
  const lastDayCol = COL_FIRST_DAY + dayCount - 1;

  ws.columns = [
    // Column A holds the header's field labels ("College:", "Room:") and the
    // A.M./P.M. gutter. At width 5 the labels overflowed off the left edge of the
    // sheet and printed as "llege:" / "om:".
    { width: 11 },
    // B-D carry the time range: wide enough for the longest parts the 12-hour
    // clock produces ("11:30 AM", "12:00 PM"). The dash keeps its own narrow
    // column so both ends sit the same distance from it. Width 10, not 9: 9 is
    // exceljs's own default column width, so setting it silently drops the <col>
    // entry and leaves the range at Excel's 8.43 default instead.
    { width: 10 },
    { width: 3 },
    { width: 10 },
    ...Array.from({ length: dayCount }, () => ({ width: 17 })),
  ];

  // --- Title block, laid out as the printed form's header --------------------
  // The form is a three-band header:
  //   rows 1-4   seal (far left) + the three institution lines, title far right
  //   rows 5-7   College / Room on the left, Program / Major / Yr-Sec on the right
  //   row  8     the green TIME + day band
  // Labels therefore live in two separate label columns, not all in column A —
  // otherwise the seal would sit on top of "College:" / "Room:".
  const titleFont = (size: number, bold = true) => ({ name: 'Arial', size, bold });
  // Where the header's left half ends. It runs one column PAST the time gutter,
  // into the first day column: that extra width is what keeps a long field value
  // (the 37-character college name) from being clipped against the "Program:"
  // label beside it, and it leaves a visible gap between the two halves.
  const HEADER_VALUE_END = COL_FIRST_DAY;
  // Right-hand label column (Program / Major / Yr-Sec) and its value column,
  // pushed one column right so they never sit on top of the left value's box.
  const RIGHT_LABEL_COL = COL_FIRST_DAY + 1;
  const RIGHT_VALUE_COL = COL_FIRST_DAY + 2;

  // The row the institution block ends on — the last stacked line printed
  // beside the seal ("Palompon, Leyte"). The seal's vertical outline rules run
  // from the top of the sheet down exactly to the bottom of this row, so the
  // seal box is as tall as the institution text it sits beside — never taller.
  const institutionLastRow = Math.min(4, Math.max(1, header.institution.length));
  // The institution lines print beside the seal, left-aligned, bold — the three
  // stacked lines in the form's top-left ("Republic of the Philippines" etc).
  // They run from the first time column to HEADER_VALUE_END, so the seal keeps
  // column A to itself and the longest line ("Palompon Institute of Technology")
  // is not clipped against the title.
  header.institution.forEach((line, index) => {
    const row = 1 + index;
    if (!line) return;
    ws.mergeCells(row, COL_TIME_START, row, HEADER_VALUE_END);
    const cell = ws.getCell(row, COL_TIME_START);
    cell.value = line;
    cell.font = titleFont(10);
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
  });

  // Title + subtitle, right half, vertically centred across rows 1-3 and 4.
  ws.mergeCells(1, RIGHT_LABEL_COL, 2, lastDayCol);
  const titleCell = ws.getCell(1, RIGHT_LABEL_COL);
  titleCell.value = header.title;
  titleCell.font = titleFont(16);
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(3, RIGHT_LABEL_COL, 4, lastDayCol);
  const subCell = ws.getCell(3, RIGHT_LABEL_COL);
  subCell.value = header.subtitle;
  subCell.font = titleFont(11);
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Rows 1-4 give the seal a square-ish box to sit in.
  ws.getRow(1).height = 20;
  ws.getRow(2).height = 14;
  ws.getRow(3).height = 14;
  ws.getRow(4).height = 14;

  /**
   * A labelled field: the label sits in `labelCol` and the value is merged from
   * `valueCol` to `valueEndCol`.
   *
   * Both parts are LEFT-aligned. Right-aligning the label made every value
   * start at a different x (the value follows the label's varying length), so
   * "College:" and "Room:" produced a ragged left edge. With the label in its
   * own column and the value merged into the next, both edges line up and the
   * two halves of the header share one grid.
   */
  const field = (
    row: number,
    label: string,
    value: string,
    labelCol: number,
    valueCol: number,
    valueEndCol: number,
    bold = false,
  ): void => {
    const labelCell = ws.getCell(row, labelCol);
    labelCell.value = label;
    labelCell.font = { name: 'Arial', size: 10, bold: true };
    labelCell.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.mergeCells(row, valueCol, row, valueEndCol);
    const valueCell = ws.getCell(row, valueCol);
    valueCell.value = value;
    valueCell.font = { name: 'Arial', size: 10, bold };
    valueCell.alignment = { horizontal: 'left', vertical: 'middle' };
  };

  const LEFT_VALUE_END = HEADER_VALUE_END; // one column into the day band, for room
  // College / Room sit under the seal, on the left.
  field(5, 'College:', header.college, COL_AMPM, COL_TIME_START, LEFT_VALUE_END, true);
  field(6, 'Room:', header.room, COL_AMPM, COL_TIME_START, LEFT_VALUE_END, true);
  // Program / Major / Yr-Sec sit on the right, under the title.
  field(5, 'Program:', header.program, RIGHT_LABEL_COL, RIGHT_VALUE_COL, lastDayCol);
  field(6, 'Major:', header.major, RIGHT_LABEL_COL, RIGHT_VALUE_COL, lastDayCol);
  field(7, 'Yr/Sec:', header.yearSection, RIGHT_LABEL_COL, RIGHT_VALUE_COL, lastDayCol);

  for (const row of [5, 6, 7]) {
    if (!ws.getRow(row).height) ws.getRow(row).height = 18;
  }
  ws.getRow(8).height = 20; // the green TIME + day band

  // Seal, top-left, in the form's own box beside the institution lines. It
  // occupies column A only, from row 1 down to the last institution line
  // ("Palompon, Leyte"), so the picture fits inside the seal's outline instead
  // of spilling past its bottom rule. Skipped without an asset so the export
  // never fails over a missing picture.
  placeLogo(wb, ws, logo, {
    topRow: 1,
    bottomRow: institutionLastRow,
    firstCol: COL_AMPM,
    lastCol: COL_AMPM,
  });

  // --- Day header row (row 8) ---------------------------------------------
  ws.mergeCells(8, COL_AMPM, 8, COL_TIME_END);
  ws.getCell(8, COL_AMPM).value = 'TIME';
  days.forEach((day, i) => {
    ws.getCell(8, COL_FIRST_DAY + i).value = exportDayLabels([day])[0].toUpperCase();
  });
  for (let col = COL_AMPM; col <= lastDayCol; col += 1) {
    const cell = ws.getCell(8, col);
    // Dark ink on the olive band, matching the form's header lettering.
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF10241A' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: MEDIUM, bottom: MEDIUM, left: THIN, right: THIN };
  }

  // --- Half-hour grid + A.M./P.M. gutter ----------------------------------
  const rows = buildGridRows(startHour, endHour, gridOptions);
  for (const gridRow of rows) {
    const endTime = indexToTime(gridRow.index + 1, startHour);
    // 12-hour clock: the form is read by eye off the page, and "13:00" is not how
    // a timetable is written. `timeRangeParts` owns the meridiem rule for the
    // on-screen gutter too, so the sheet and the screen always agree.
    const range = timeRangeParts(
      to24h(gridRow.hour, gridRow.offset),
      to24h(endTime.hour, endTime.offset),
    );
    ws.getCell(gridRow.row, COL_TIME_START).value = range.start;
    // The form separates the two ends of the range with a dash in its own
    // narrow column, rather than one "7:00 - 7:30" string.
    ws.getCell(gridRow.row, COL_TIME_DASH).value = '-';
    ws.getCell(gridRow.row, COL_TIME_END).value = range.end;

    // A.M./P.M. spans a whole half-day, merged down the gutter exactly like the
    // printed form's leftmost column. Two rules, derived from the SAME boundary:
    // the first row always opens a period, and the next period opens at the
    // 12:00 (or 00:00) boundary. Computing the span as "hours until the next
    // boundary" — rather than a flat 12 — is what keeps the merges a clean
    // partition: a flat 12 from a 07:00 start would run past noon and overlap
    // the P.M. block, which exceljs rejects.
    const opensPeriod =
      gridRow.index === 0 || (gridRow.offset === 0 && gridRow.hour % 12 === 0);
    if (opensPeriod) {
      const hoursUntilNextBoundary = (12 - (gridRow.hour % 12)) % 12 || 12;
      const span = Math.min(hoursUntilNextBoundary * 2, rows.length - gridRow.index);
      const cell = ws.getCell(gridRow.row, COL_AMPM);
      cell.value = gridRow.hour >= 12 ? 'P.M.' : 'A.M.';
      if (span > 1) {
        ws.mergeCells(gridRow.row, COL_AMPM, gridRow.row + span - 1, COL_AMPM);
      }
    }
  }

  for (const gridRow of rows) {
    for (let col = COL_AMPM; col <= lastDayCol; col += 1) {
      const cell = ws.getCell(gridRow.row, col);
      cell.font = { name: 'Arial', size: 10 };
      cell.alignment = {
        // The range has to read as one line. The start is pushed up against the
        // dash from the left and the end hugs it from the right, so the dash
        // keeps a fixed x and the gap either side of it is equal however long
        // the two strings are. Right-aligning BOTH ends left three stray spaces
        // after the dash and made the time column look off.
        horizontal: col === COL_TIME_START ? 'right' : col === COL_TIME_END ? 'left' : 'center',
        vertical: 'middle',
        wrapText: col >= COL_FIRST_DAY,
      };
      cell.border = { top: THIN, bottom: THIN, left: THIN, right: THIN };
    }
    const ampmCell = ws.getCell(gridRow.row, COL_AMPM);
    ampmCell.font = { name: 'Arial', size: 10, bold: true };
    ampmCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LABEL_FILL } };
  }

  // --- Placed classes: merged blocks filled with the assignment color ------
  // This is the part that has to match the screen exactly — the same hex the
  // Chair picked for that subject is the fill on the sheet.
  const columnByDay = new Map<DayOfWeek, number>();
  days.forEach((day, i) => columnByDay.set(day, COL_FIRST_DAY + i));

  for (const slot of slots) {
    const col = columnByDay.get(slot.day_of_week);
    if (!col) continue;
    const block = placeBlock(slot, gridOptions, startHour, endHour);
    if (!block) continue;
    const hex = colorFor(slot);

    // Fill every covered cell BEFORE merging: exceljs keeps the master cell's
    // style, so filling only the top-left would leave the rest of the block
    // uncolored once merged.
    for (let row = block.topRow; row <= block.bottomRow; row += 1) {
      ws.getCell(row, col).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: toArgb(hex) },
      };
    }
    if (block.rowSpan > 1) {
      ws.mergeCells(block.topRow, col, block.bottomRow, col);
    }
    const anchor = ws.getCell(block.topRow, col);
    anchor.value = blockText(slot);
    anchor.font = {
      name: 'Arial',
      size: 10,
      bold: true,
      color: { argb: textArgbFor(hex) },
    };
    anchor.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    anchor.border = { top: MEDIUM, bottom: MEDIUM, left: THIN, right: THIN };
  }

  // --- Lock the grid row heights LAST -------------------------------------
  // This has to run after every value, merge and block is written. Excel
  // auto-fits a row to its tallest wrapped/merged cell, so a 3-hour block
  // would otherwise inflate the rows it covers and break the uniform grid the
  // whole form depends on. Setting the height as the final write pins every
  // row to the same value regardless of how long any class runs.
  for (const gridRow of rows) {
    ws.getRow(gridRow.row).height = GRID_ROW_HEIGHT;
  }

  // --- Outline around the whole grid --------------------------------------
  // The form is boxed: a medium rule top and bottom plus down both sides, so
  // the grid reads as one framed table. Applied after the per-cell thin borders
  // (so it wins where the two meet) and after the merges (so a block sitting on
  // the edge still takes the frame).
  applyGridOutline(ws, {
    headerRow: 8,
    firstRow: gridOptions.firstRow,
    lastRow: rows[rows.length - 1]?.row ?? gridOptions.firstRow,
    firstCol: COL_AMPM,
    lastCol: lastDayCol,
  });

  // --- Signature footer (the form's Prepared / Reviewed / Approved row) ----
  const lastGridRow = rows[rows.length - 1]?.row ?? gridOptions.firstRow;
  const footerRow = lastGridRow + 1;
  ws.getRow(footerRow).height = 28;
  ws.mergeCells(footerRow, COL_AMPM, footerRow, COL_TIME_END);
  const prepared = ws.getCell(footerRow, COL_AMPM);
  prepared.value = 'Prepared by:';
  prepared.font = { name: 'Arial', size: 10, bold: true };
  prepared.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.mergeCells(footerRow, COL_FIRST_DAY, footerRow, lastDayCol);
  const signatures = ws.getCell(footerRow, COL_FIRST_DAY);
  signatures.value = 'Reviewed by:                                     Approved by:';
  signatures.font = { name: 'Arial', size: 10, bold: true };
  signatures.alignment = { horizontal: 'left', vertical: 'middle' };

  // --- Box the header block and the signature row --------------------------
  // The form frames both: the title/College/Room/Program block at the top and
  // the Prepared/Reviewed/Approved row at the bottom, matching the grid's own
  // outline in the middle. The header is outlined ROW BY ROW so College, Room,
  // Program, Major and Yr/Sec each sit in their own box, as on the form.
  // The header block is outlined through row 7, so the Yr/Sec line gets its own
  // box instead of borrowing the top rule of the TIME band.
  // The seal column (A) is left out of the row-by-row pass: the horizontal
  // rules would slice through the seal's own box. It gets a single vertical
  // outline instead, drawn just below.
  applyRowOutlines(ws, { firstRow: 1, lastRow: 7, firstCol: COL_TIME_START, lastCol: lastDayCol });
  // Below the seal the left label column (College: / Room:) rejoins the row
  // boxes, so those rows outline from column A as before.
  applyRowOutlines(ws, { firstRow: 5, lastRow: 7, firstCol: COL_AMPM, lastCol: COL_AMPM });
  // Seal outline: a medium box around column A spanning only rows 1 through
  // the last institution line, so the two vertical rules beside the seal end
  // flush with "Palompon, Leyte" instead of running the whole header height.
  applyBox(ws, {
    firstRow: 1,
    lastRow: institutionLastRow,
    firstCol: COL_AMPM,
    lastCol: COL_AMPM,
  });
  // The blank gap rows under the seal box keep the sheet's outer left rule
  // unbroken down to the College row.
  for (let row = institutionLastRow + 1; row <= 4; row += 1) {
    const gapCell = ws.getCell(row, COL_AMPM);
    gapCell.border = { ...(gapCell.border as object), left: MEDIUM };
  }
  applyBox(ws, {
    firstRow: footerRow,
    lastRow: footerRow,
    firstCol: COL_AMPM,
    lastCol: lastDayCol,
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

/**
 * Hand the workbook to the browser as a download.
 *
 * The .xlsx extension and MIME type are what make Windows open it in Excel
 * rather than treating it as an unknown file. The object URL is revoked after a
 * beat — without that the blob stays pinned for the life of the tab and every
 * export leaks a copy of the sheet.
 */
export function downloadWorkbook(buffer: Uint8Array, fileName: string): void {
  const blob = new Blob([buffer.slice().buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Filesystem-safe name: "IE Lab 1 - 2026-2027 — 1st Sem" → "IE_Lab_1_...". */
export function exportFileName(...parts: (string | null | undefined)[]): string {
  return parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .map((part) => part.replace(/[^\w\s.-]/g, '').trim().replace(/\s+/g, '_'))
    .join(' - ')
    .slice(0, 120);
}

