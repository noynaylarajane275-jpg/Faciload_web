import { describe, expect, it } from 'vitest';
import type { DayOfWeek, ScheduleSlot } from './schedule-slots';
import {
  COL_AMPM,
  COL_FIRST_DAY,
  COL_TIME_DASH,
  COL_TIME_END,
  COL_TIME_START,
  buildGridRows,
  buildScheduleWorkbook,
  exportDayLabels,
  exportFileName,
  halfHourIndex,
  indexToTime,
  placeBlock,
  sniffImageFormat,
  textArgbFor,
  toArgb,
  type ExportHeader,
} from './schedule-export';

const OPTS = { firstRow: 9 };

function makeSlot(overrides: Partial<ScheduleSlot> = {}): ScheduleSlot {
  return {
    id: 'slot-1',
    workload_assignment_id: 'a1',
    room_id: 'r1',
    room_name: 'IE Lab 1',
    day_of_week: 'MON',
    start_time: '08:00',
    end_time: '09:30',
    session_type: 'LAB',
    session_hours: 1.5,
    faculty_id: 'f1',
    faculty_name: 'Maria Santos',
    subject_code: 'IE 105',
    subject_title: 'Plant Layout',
    subject_units: 3,
    section_id: 's1',
    section_label: 'BSIE 1A',
    term_id: 't1',
    color: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  } as ScheduleSlot;
}

const HEADER: ExportHeader = {
  title: 'CLASSROOM UTILIZATION',
  subtitle: '1st Sem. S.Y. 2026-2027',
  institution: [
    'Republic of the Philippines',
    'Palompon Institute of Technology',
    'Palompon, Leyte',
  ],
  college: 'College of Technology and Engineering',
  room: 'IE Lab 1',
  program: 'BSIE',
  major: 'Industrial Engineering',
  yearSection: '1A',
};

const DAYS: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

describe('schedule-export — grid math', () => {
  it('numbers one row per half hour, starting at firstRow', () => {
    const rows = buildGridRows(7, 20, OPTS);
    expect(rows).toHaveLength(26);
    expect(rows[0]).toMatchObject({ row: 9, hour: 7, offset: 0, index: 0 });
    expect(rows[1]).toMatchObject({ row: 10, hour: 7, offset: 1, index: 1 });
    expect(rows[2]).toMatchObject({ row: 11, hour: 8, offset: 0, index: 2 });
    expect(rows[25]).toMatchObject({ row: 34, hour: 19, offset: 1 });
  });

  it('round-trips halfHourIndex and indexToTime', () => {
    for (const hour of [7, 13, 19]) {
      for (const offset of [0, 1] as const) {
        expect(indexToTime(halfHourIndex(hour, offset, 7), 7)).toEqual({ hour, offset });
      }
    }
  });

  it('maps a block to the rows it covers', () => {
    // 08:00–09:30 spans 08:00, 08:30, 09:00 → three half-hour rows.
    const block = placeBlock(makeSlot(), OPTS, 7, 20);
    expect(block).not.toBeNull();
    expect(block!.rowSpan).toBe(3);
    expect(block!.topRow).toBe(11); // 08:00 is index 2 → row 9 + 2
    expect(block!.bottomRow).toBe(13);
  });

  it('snaps an off-grid time to the nearest half hour', () => {
    const block = placeBlock(
      makeSlot({ start_time: '08:05', end_time: '08:20' }),
      OPTS,
      7,
      20,
    );
    expect(block!.rowSpan).toBe(1);
  });

  it('drops a block that falls entirely outside the printed grid', () => {
    expect(placeBlock(makeSlot({ start_time: '05:00', end_time: '06:00' }), OPTS, 7, 20)).toBeNull();
  });

  it('drops a zero-length block', () => {
    expect(placeBlock(makeSlot({ start_time: '09:00', end_time: '09:00' }), OPTS, 7, 20)).toBeNull();
  });

  it('clips a block that runs past the last row', () => {
    const block = placeBlock(makeSlot({ start_time: '19:30', end_time: '21:00' }), OPTS, 7, 20);
    expect(block!.bottomRow).toBe(34); // last grid row
  });

  it('labels days Mon → Sat for the header row', () => {
    expect(exportDayLabels(DAYS)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  });
});

describe('schedule-export — colors', () => {
  it('converts the chosen hex to Excel ARGB', () => {
    expect(toArgb('#2FBF71')).toBe('FF2FBF71');
    expect(toArgb('#2563eb')).toBe('FF2563EB');
  });

  it('falls back to the default blue block when no color is set', () => {
    expect(toArgb(null)).toBe('FFFFE3E8');
    expect(toArgb('not-a-color')).toBe('FFFFE3E8');
  });

  it('flips the text to white on a dark fill, and keeps ink on a light one', () => {
    expect(textArgbFor('#7C3AED')).toBe('FFFFFFFF'); // purple → white text
    expect(textArgbFor('#FFE3E8')).toBe('FF10241A'); // pale → dark text
    expect(textArgbFor(null)).toBe('FF10241A');
  });
});

describe('schedule-export — print layout', () => {
  /** Read the generated buffer back, so these assert on real xlsx output. */
  async function readBack(buffer: Uint8Array) {
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    return wb.getWorksheet('Schedule')!;
  }

  const base = {
    header: HEADER,
    days: DAYS,
    startHour: 7,
    endHour: 20,
    colorFor: () => '#2563EB',
  };

  it('outlines every header row separately', async () => {
    // The form boxes each field line, not one frame around the whole header, so
    // College / Room / Program / Major / Yr-Sec each read as their own cell.
    // The boxes start at the first text column: the seal column is outlined on
    // its own (see the seal-outline test) so no horizontal rule cuts through
    // the seal's box.
    const ws = await readBack(await buildScheduleWorkbook({ ...base, slots: [] }));
    for (const row of [1, 2, 3, 4, 5, 6, 7]) {
      const left = ws.getCell(row, COL_TIME_START).border as Record<string, { style?: string }>;
      const right = ws.getCell(row, COL_FIRST_DAY + 5).border as Record<string, { style?: string }>;
      expect(left.top?.style, `row ${row} top`).toBe('medium');
      expect(left.bottom?.style, `row ${row} bottom`).toBe('medium');
      expect(left.left?.style, `row ${row} left`).toBe('medium');
      expect(right.right?.style, `row ${row} right`).toBe('medium');
    }
  });

  it('outlines the seal down to the Palompon, Leyte line and no further', async () => {
    // The two vertical rules beside the logo — the sheet's outer left edge and
    // the seal column's right edge — run from the top of the sheet and stop at
    // the bottom of the last institution line ("Palompon, Leyte", row 3),
    // closing the seal's box. Nothing below that row keeps the seal's rules.
    const ws = await readBack(await buildScheduleWorkbook({ ...base, slots: [] }));
    const edge = (row: number, side: 'top' | 'bottom' | 'left' | 'right') =>
      (ws.getCell(row, COL_AMPM).border as Record<string, { style?: string }>)[side]?.style;
    for (const row of [1, 2, 3]) {
      expect(edge(row, 'left'), `seal row ${row} left`).toBe('medium');
      expect(edge(row, 'right'), `seal row ${row} right`).toBe('medium');
    }
    // The box closes flush with the Palompon, Leyte line...
    expect(edge(1, 'top')).toBe('medium');
    expect(edge(3, 'bottom')).toBe('medium');
    // ...so the blank gap row under the seal carries neither its vertical
    // rules nor its closing line. (The outer left edge is the one exception:
    // the sheet's own frame stays unbroken down to the College row.)
    expect(edge(4, 'right')).toBeUndefined();
    expect(edge(4, 'top')).toBeUndefined();
    expect(edge(4, 'bottom')).toBeUndefined();
    expect(edge(4, 'left')).toBe('medium');
  });

  it('left-aligns every header label and value so the columns line up', async () => {
    // Right-aligning the labels made each value start at a different x, giving
    // the header a ragged left edge. Both halves now share one alignment.
    const ws = await readBack(await buildScheduleWorkbook({ ...base, slots: [] }));
    const left = (row: number, col: number) =>
      (ws.getCell(row, col).alignment as { horizontal?: string } | undefined)?.horizontal;
    // Labels in column A, values merged from B across the gutter; the right half
    // starts one column past the day band's first column, out of the value's way.
    expect(left(5, COL_AMPM)).toBe('left');
    expect(left(6, COL_AMPM)).toBe('left');
    expect(left(5, COL_TIME_START)).toBe('left');
    expect(left(5, COL_FIRST_DAY)).toBe('left');
    expect(left(5, COL_FIRST_DAY + 1)).toBe('left');
    expect(left(7, COL_FIRST_DAY + 1)).toBe('left');
    expect(left(7, COL_FIRST_DAY + 2)).toBe('left');
  });

  it('keeps every half-hour row the same height, whatever the class length', async () => {
    // A 30-minute block and a 3-hour block must leave the grid just as even.
    const buffer = await buildScheduleWorkbook({
      ...base,
      slots: [
        makeSlot({ start_time: '08:00', end_time: '08:30' }),
        makeSlot({ start_time: '13:00', end_time: '16:00' }),
      ],
    });
    const ws = await readBack(buffer);
    const heights = new Set<number>();
    for (let row = 9; row <= 34; row += 1) {
      heights.add(ws.getRow(row).height ?? 0);
    }
    // One distinct height for the whole grid — no row inflated by a long class.
    expect([...heights]).toEqual([22]);
  });

  it('frames the grid with a medium outline on all four sides', async () => {
    const buffer = await buildScheduleWorkbook({ ...base, slots: [] });
    const ws = await readBack(buffer);
    const lastDayCol = COL_FIRST_DAY + DAYS.length - 1;

    // Top edge of the header band, and the bottom of the last grid row.
    expect((ws.getCell(8, COL_AMPM).border as { top?: { style?: string } }).top?.style).toBe('medium');
    expect((ws.getCell(34, COL_AMPM).border as { bottom?: { style?: string } }).bottom?.style).toBe('medium');
    // Left and right edges.
    expect((ws.getCell(20, COL_AMPM).border as { left?: { style?: string } }).left?.style).toBe('medium');
    expect((ws.getCell(20, lastDayCol).border as { right?: { style?: string } }).right?.style).toBe('medium');
  });

  it('leaves interior grid lines thin, so the half-hour rules stay visible', async () => {
    const buffer = await buildScheduleWorkbook({ ...base, slots: [] });
    const ws = await readBack(buffer);
    // Row 15 (10:00 AM) is plain interior — NOT row 19/20, which the reserved
    // lunch band deliberately frames with medium rules like a section edge.
    const interior = ws.getCell(15, COL_FIRST_DAY + 1).border as
      | { top?: { style?: string }; left?: { style?: string } }
      | undefined;
    expect(interior?.top?.style).toBe('thin');
    expect(interior?.left?.style).toBe('thin');

    // The lunch band (12:00–1:00) is a labelled section boundary: its merged
    // anchor carries medium rules top and bottom, matching the day-header band.
    const lunch = ws.getCell(19, COL_FIRST_DAY + 1).border as
      | { top?: { style?: string }; bottom?: { style?: string } }
      | undefined;
    expect(lunch?.top?.style).toBe('medium');
  });

  it('prints landscape and centred on the page', async () => {
    const buffer = await buildScheduleWorkbook({ ...base, slots: [] });
    // The page setup is written into the sheet XML, not the cell model, so read
    // it from the workbook the way Excel does.
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const setup = (wb.getWorksheet('Schedule') as unknown as {
      pageSetup: { orientation?: string; horizontalCentered?: boolean; verticalCentered?: boolean };
    }).pageSetup;
    // Landscape so Mon–Sat plus the time gutter fit one page wide.
    expect(setup.orientation).toBe('landscape');
    expect(setup.horizontalCentered).toBe(true);
    expect(setup.verticalCentered).toBe(true);
  });

  it('embeds a logo when one is supplied, and still exports without one', async () => {
    // A 1x1 transparent PNG — enough to prove the image is embedded.
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const ExcelJS = await import('exceljs');

    /** Images round-trip through the package's `media` part, not the model. */
    const mediaCount = async (buffer: Uint8Array): Promise<number> => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
      return (wb as unknown as { media: unknown[] }).media.length;
    };

    expect(await mediaCount(await buildScheduleWorkbook({ ...base, slots: [], logo: { base64: png, extension: 'png' } }))).toBe(1);
    // No logo supplied must not throw or embed anything.
    expect(await mediaCount(await buildScheduleWorkbook({ ...base, slots: [] }))).toBe(0);
  });

  it('returns null for a logo fetch that fails, instead of throwing', async () => {
    // No fetch available in this environment → graceful null.
    const { loadLogoFromUrl } = await import('./schedule-export');
    expect(await loadLogoFromUrl(null)).toBeNull();
  });
});


describe('schedule-export — workbook', () => {
  /** Read the generated buffer back, so these assert on real xlsx output. */
  async function readBack(buffer: Uint8Array) {
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    return wb.getWorksheet('Schedule')!;
  }

  it('produces a valid .xlsx with the form header and time grid', async () => {
    const buffer = await buildScheduleWorkbook({
      header: HEADER,
      slots: [],
      days: DAYS,
      startHour: 7,
      endHour: 20,
      colorFor: () => '#2563EB',
    });
    // A real .xlsx is a ZIP archive: "PK" magic bytes.
    expect(buffer.byteLength).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(buffer.slice(0, 2))).toBe('PK');

    const ws = await readBack(buffer);
    // Header block, matching the printed form. The seal owns column A, so the
    // title and every field start to its right and never sit on top of it.
    expect(ws.getCell(1, COL_AMPM).value).toBeNull();
    expect(ws.getCell(1, COL_FIRST_DAY + 1).value).toBe('CLASSROOM UTILIZATION');
    expect(ws.getCell(3, COL_FIRST_DAY + 1).value).toBe('1st Sem. S.Y. 2026-2027');
    expect(ws.getCell(5, COL_AMPM).value).toBe('College:');
    expect(ws.getCell(6, COL_AMPM).value).toBe('Room:');
    // The three institution lines print beside the seal, in rows 1-3.
    expect(ws.getCell(1, COL_TIME_START).value).toBe('Republic of the Philippines');
    expect(ws.getCell(2, COL_TIME_START).value).toBe('Palompon Institute of Technology');
    expect(ws.getCell(3, COL_TIME_START).value).toBe('Palompon, Leyte');
    // The value boxes print in the row of their own label, not the one above.
    expect(ws.getCell(5, COL_TIME_START).value).toBe(HEADER.college);
    expect(ws.getCell(6, COL_TIME_START).value).toBe('IE Lab 1');
    // Day headers — Monday in the first day column.
    expect(ws.getCell(8, COL_FIRST_DAY).value).toBe('MON');
    // Time gutter: 7:00 opens the grid and each row ends at the next slot.
    expect(ws.getCell(9, COL_TIME_START).value).toBe('7:00');
    expect(ws.getCell(9, COL_TIME_END).value).toBe('7:30 AM');
    expect(ws.getCell(11, COL_TIME_START).value).toBe('8:00');
    // A.M. marks the start of the morning half-day.
    expect(ws.getCell(9, COL_AMPM).value).toBe('A.M.');
  });

  it('prints the time gutter on the 12-hour clock, never 24-hour', async () => {
    const buffer = await buildScheduleWorkbook({
      header: HEADER,
      slots: [],
      days: DAYS,
      startHour: 7,
      endHour: 20,
      colorFor: () => '#2563EB',
    });
    const ws = await readBack(buffer);
    // 7:00 - 7:30 AM: the marker is printed once, on the end, because both ends
    // share a meridiem.
    expect(ws.getCell(9, COL_TIME_START).value).toBe('7:00');
    expect(ws.getCell(9, COL_TIME_END).value).toBe('7:30 AM');
    // 1:00 PM, not "13:00" — the form is read by eye, never off a 24-hour clock.
    expect(ws.getCell(21, COL_TIME_START).value).toBe('1:00');
    expect(ws.getCell(21, COL_TIME_END).value).toBe('1:30 PM');
    // The row that crosses noon marks BOTH ends, or "11:30 - 12:00 AM" would read
    // as a morning slot.
    expect(ws.getCell(18, COL_TIME_START).value).toBe('11:30 AM');
    expect(ws.getCell(18, COL_TIME_END).value).toBe('12:00 PM');
  });

  it('splits each range around the dash, so the gaps either side match', async () => {
    const buffer = await buildScheduleWorkbook({
      header: HEADER,
      slots: [],
      days: DAYS,
      startHour: 7,
      endHour: 20,
      colorFor: () => '#2563EB',
    });
    const ws = await readBack(buffer);
    const horizontal = (row: number, col: number) =>
      (ws.getCell(row, col).alignment as { horizontal?: string } | undefined)?.horizontal;
    // Start pushed up to the dash from the left, end hugging it from the right:
    // the dash keeps a fixed x and the two gaps stay equal however long the
    // strings are. Right-aligning BOTH ends left three stray spaces after it.
    expect(horizontal(9, COL_TIME_START)).toBe('right');
    expect(horizontal(9, COL_TIME_DASH)).toBe('center');
    expect(horizontal(9, COL_TIME_END)).toBe('left');
  });

  it('gives the header value boxes room for their longest text', async () => {
    const buffer = await buildScheduleWorkbook({
      header: HEADER,
      slots: [],
      days: DAYS,
      startHour: 7,
      endHour: 20,
      colorFor: () => '#2563EB',
    });
    const ws = await readBack(buffer);
    // Both halves of the header merge their value from the first time column
    // across the gutter and into the day band's first column. That width is what
    // stopped the college name being cut off as "College of Techn|Program:".
    const boxChars = [COL_TIME_START, COL_TIME_DASH, COL_TIME_END, COL_FIRST_DAY].reduce(
      (total, col) => total + (ws.getColumn(col).width ?? 0),
      0,
    );
    expect(boxChars).toBeGreaterThan(HEADER.college.length);
    expect(boxChars).toBeGreaterThan('Palompon Institute of Technology'.length);
    expect(ws.getCell(1, COL_FIRST_DAY).isMerged).toBe(true);
    expect(ws.getCell(5, COL_FIRST_DAY).isMerged).toBe(true);
    // ...and the right half starts past it, so the two sections have a gap.
    expect(ws.getCell(5, COL_FIRST_DAY + 1).value).toBe('Program:');
    expect(ws.getCell(5, COL_FIRST_DAY + 2).value).toBe('BSIE');
  });

  it('fills a placed class with the chosen subject color across all its rows', async () => {
    const buffer = await buildScheduleWorkbook({
      header: HEADER,
      slots: [makeSlot({ start_time: '08:00', end_time: '09:30' })],
      days: DAYS,
      startHour: 7,
      endHour: 20,
      colorFor: () => '#2563EB',
    });
    const ws = await readBack(buffer);

    // Monday is the first day column; 08:00 is row 11.
    const anchor = ws.getCell(11, COL_FIRST_DAY);
    expect(anchor.value).toContain('Plant Layout');
    expect(anchor.font?.color?.argb).toBe('FFFFFFFF'); // white text on blue
    // Every covered row carries the fill — not just the merged master cell.
    for (const row of [11, 12, 13]) {
      const fill = ws.getCell(row, COL_FIRST_DAY).fill as
        | { fgColor?: { argb?: string } }
        | undefined;
      expect(fill?.fgColor?.argb).toBe('FF2563EB');
    }
  });

  it('places each class under its own day column', async () => {
    const buffer = await buildScheduleWorkbook({
      header: HEADER,
      slots: [makeSlot({ day_of_week: 'WED' })],
      days: DAYS,
      startHour: 7,
      endHour: 20,
      colorFor: () => '#2FBF71',
    });
    const ws = await readBack(buffer);

    // Wednesday is the third day column; Monday stays empty.
    expect(ws.getCell(11, COL_FIRST_DAY + 2).value).toContain('Plant Layout');
    expect(ws.getCell(11, COL_FIRST_DAY).value).toBeNull();
  });

  it('uses the default blue fill when a subject has no color', async () => {
    const buffer = await buildScheduleWorkbook({
      header: HEADER,
      slots: [makeSlot()],
      days: DAYS,
      startHour: 7,
      endHour: 20,
      colorFor: () => null,
    });
    const ws = await readBack(buffer);
    const fill = ws.getCell(11, COL_FIRST_DAY).fill as
      | { fgColor?: { argb?: string } }
      | undefined;
    expect(fill?.fgColor?.argb).toBe('FFFFE3E8');
  });
});

describe('schedule-export — file name', () => {
  it('builds a filesystem-safe name', () => {
    // The em-dash is stripped as a non-word character, so the two parts are
    // joined by the separator only.
    expect(exportFileName('IE Lab 1', '2026-2027 — 1st Sem')).toBe('IE_Lab_1 - 2026-2027_1st_Sem');
  });

  it('skips empty parts instead of emitting stray dashes', () => {
    expect(exportFileName('IE Lab 1', null, '', undefined)).toBe('IE_Lab_1');
  });
});

describe('schedule-export — image format sniffing', () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
  const GIF = bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);

  it('identifies each embeddable format from its magic bytes', () => {
    expect(sniffImageFormat(PNG)).toBe('png');
    expect(sniffImageFormat(JPEG)).toBe('jpeg');
    expect(sniffImageFormat(GIF)).toBe('gif');
  });

  it('trusts the bytes, not the file name — the broken-picture bug', () => {
    // Excel shows "The picture can't be displayed" when JPEG bytes are tagged as
    // PNG, which is exactly what happens when a JPEG is saved as "logo.png".
    // The old extension-from-URL check got this wrong; sniffing cannot.
    expect(sniffImageFormat(JPEG)).not.toBe('png');
  });

  it('returns null for formats exceljs cannot embed, so the seal is skipped', () => {
    // RIFF....WEBP — a webp must not be embedded, or the file will not open.
    expect(sniffImageFormat(bytes(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00))).toBeNull();
    expect(sniffImageFormat(new Uint8Array(0))).toBeNull();
  });
});
