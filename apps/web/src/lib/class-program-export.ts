import type { DayOfWeek, ScheduleSlot } from './schedule-slots';
import {
  MEDIUM,
  SCHOOL_LOGO_CANDIDATES,
  THIN,
  downloadWorkbook,
  exportFileName,
  loadSchoolLogo,
  placeLogo,
  type ExportImage,
} from './schedule-export';
import {
  DEFAULT_APP_BY,
  DEFAULT_COLLEGE,
  DEFAULT_DATE,
  DEFAULT_DEPARTMENT,
  DEFAULT_PAGE_NO,
  DEFAULT_PREP_BY,
  DEFAULT_REF_CODE,
  DEFAULT_REV_BY,
  DEFAULT_REV_NO,
  DOC_TITLE,
  INSTITUTION_LINES,
  officialTermLabel,
} from '../components/classprogram/OfficialHeader';
import type { OtherFunctionType } from './other-function-sessions';

/**
 * Official "INSTRUCTOR'S CLASS PROGRAM" Excel builder.
 *
 * Reproduces the department's INSTRUCTORS-CLASS-PROGRAM-SEM2-2026-2027.xls
 * workbook sheet-for-sheet: the three-band header (seal box, institution
 * lines, doc-control block), the 7:00 AM-7:00 PM MON-FRI grid with the merged
 * lunch band, the footnote, the A/B/C workload tables and the ACTION TAKEN
 * approval block. Row and column anchors below are the official sheet's own
 * coordinates, so a printed export lines up with the hand-filled original.
 */

/** Column A holds labels and the time gutter; B-F are MON-FRI. */
export const COL_LABEL = 1;
export const COL_FIRST_DAY = 2;
export const COL_LAST_DAY = 6;

/** Official row anchors (1-based, from the original workbook). */
export const ROW_SEAL_TOP = 1;
export const ROW_SEAL_BOTTOM = 7;
export const ROW_COLLEGE = 5;
export const ROW_TITLE = 6;
export const ROW_TITLE_BOTTOM = 7;
export const ROW_SPACER = 8;
export const ROW_FIELD_FIRST = 9;
export const ROW_FIELD_LAST = 11;
export const ROW_DAY_HEADER = 13;
export const ROW_GRID_FIRST = 14;
export const ROW_LUNCH = 24;
export const ROW_GRID_LAST = 36;
export const ROW_FOOTNOTE = 37;
export const ROW_TABLE_SPACER = 38;
export const ROW_WORKLOAD_HEADER = 39;
export const ROW_TEACHING_LOAD = 40;
export const ROW_SERVICE_CREDITS = 41;
export const ROW_TEACHING_OVERLOAD = 43;
export const ROW_TEACHING_SUBTOTAL = 49;
export const ROW_OTHER_FUNCTIONS = 51;
export const ROW_RESEARCH = 52;
export const ROW_EXTENSION = 53;
export const ROW_IMP = 54;
export const ROW_CONSULTATION = 55;
export const ROW_OTHER_SUBTOTAL = 56;
export const ROW_DESIGNATION = 58;
export const ROW_DESIGNATION_SUBTOTAL = 61;
export const ROW_GRAND_TOTAL = 63;
export const ROW_APPROVAL_HEADER = 65;
export const ROW_PREPARED = 66;
export const ROW_REVIEWED = 67;
export const ROW_VERIFIED = 68;
export const ROW_APPROVED = 69;
export const ROW_EFFECTIVE = 70;

export const DAY_START_HOUR = 7;
export const LUNCH_START_HOUR = 12;
export const LUNCH_END_HOUR = 13;
export const DAY_END_HOUR = 19;

/** Uniform half-hour row height - blocks span whole rows, so all must match. */
const GRID_ROW_HEIGHT = 18;

const FULL_DAY_LABELS: Record<DayOfWeek, string> = {
  MON: 'MONDAY',
  TUE: 'TUESDAY',
  WED: 'WEDNESDAY',
  THU: 'THURSDAY',
  FRI: 'FRIDAY',
  SAT: 'SATURDAY',
};

const OFFICIAL_DAYS: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

/** 24h to 12h without a meridiem, the way the form writes it ("7:00 - 7:30"). */
function clockLabel(totalMinutes: number): string {
  const hour24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')}`;
}

/** Half-hour label for an official grid row: "7:00 - 7:30", "12:00 - 1:00". */
function rangeLabel(index: number): string {
  // Rows 0-9 cover 7:00-12:00, row 10 is the lunch hour, rows 11+ 1:00-7:00.
  const startMinutes = index < 10
    ? DAY_START_HOUR * 60 + index * 30
    : index === 10
      ? LUNCH_START_HOUR * 60
      : LUNCH_END_HOUR * 60 + (index - 11) * 30;
  const endMinutes = index === 10 ? LUNCH_END_HOUR * 60 : startMinutes + 30;
  return `${clockLabel(startMinutes)} - ${clockLabel(endMinutes)}`;
}

/**
 * Map a "HH:MM" time to the official sheet row.
 * Lunch collapses to its single merged row, matching the original workbook.
 */
export function rowForMinutes(totalMinutes: number): number {
  if (totalMinutes < LUNCH_START_HOUR * 60) {
    return ROW_GRID_FIRST + Math.floor((totalMinutes - DAY_START_HOUR * 60) / 30);
  }
  if (totalMinutes < LUNCH_END_HOUR * 60) return ROW_LUNCH;
  return ROW_LUNCH + 1 + Math.floor((totalMinutes - LUNCH_END_HOUR * 60) / 30);
}

/** True when a slot can be drawn (inside the grid, never across lunch). */
function isDrawable(
  slot: Pick<ScheduleSlot, 'day_of_week' | 'start_time' | 'end_time'>,
): boolean {
  if (!OFFICIAL_DAYS.includes(slot.day_of_week)) return false;
  const start = toMinutes(slot.start_time);
  const end = toMinutes(slot.end_time);
  if (start < DAY_START_HOUR * 60 || end > DAY_END_HOUR * 60) return false;
  // The API rejects lunch overlaps; mirror the web grid and drop any strays.
  return !(start < LUNCH_END_HOUR * 60 && end > LUNCH_START_HOUR * 60);
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function roundHours(hours: number): number {
  return Math.round(hours * 100) / 100;
}

/** The four lines the official block shows: subject, section, faculty, room. */
function blockText(slot: ScheduleSlot): string {
  const code = slot.session_type === 'LAB' ? `${slot.subject_code} L` : slot.subject_code;
  return [code, slot.section_label, slot.faculty_name, slot.room_name ?? 'TBA'].join('\n');
}

/** Load exceljs defensively (CJS interop - same unwrapping as schedule-export). */
async function loadExcelJs(): Promise<{ Workbook: new () => import('exceljs').Workbook }> {
  const excelModule = await import('exceljs');
  return (
    (excelModule as { default?: { Workbook?: unknown } }).default ?? excelModule
  ) as { Workbook: new () => import('exceljs').Workbook };
}



export interface ClassProgramWorkload {
  lectureHrs: number;
  labHrs: number;
  numPreparations: number;
  totalStudents?: number;
  assignments?: ClassProgramWorkloadAssignment[];
  otherFunctionTotals?: Record<OtherFunctionType, number>;
  designationTotals?: Array<{ name: string; totalHours: number }>;
}

export interface ClassProgramWorkloadAssignment {
  subjectCode: string;
  subjectTitle: string;
  sectionLabel: string;
  facultyName: string;
  lectureHrs: number;
  labHrs: number;
}

export interface ClassProgramOtherFunctionSession {
  functionType: OtherFunctionType;
  title: string;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
}

export interface ClassProgramDesignationSession {
  designationName: string;
  title: string;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
}

export interface ClassProgramExportOptions {
  /** Instructor fields; omit for the Master Timetable export. */
  faculty?: { first_name: string; last_name: string; rank?: string | null } | null;
  /** Active term - drives the "Second Sem., S.Y." line. */
  schoolYear?: string | null;
  slots: ScheduleSlot[];
  otherFunctionSessions?: ClassProgramOtherFunctionSession[];
  designationSessions?: ClassProgramDesignationSession[];
  workload?: ClassProgramWorkload | null;
  department?: string;
  college?: string;
  /** Sheet name - instructor surname, or "Master Timetable". */
  sheetName?: string;
  logo?: ExportImage | null;
  /** Second seal for the header's second logo box (B1:B7). */
  logo2?: ExportImage | null;
}

/**
 * Build the official class program workbook. Separated from download plumbing
 * so tests can grab the buffer without touching the DOM.
 */
export async function buildClassProgramWorkbook(
  opts: ClassProgramExportOptions,
): Promise<Uint8Array> {
  const {
    faculty = null,
    schoolYear = null,
    slots,
    otherFunctionSessions = [],
    designationSessions = [],
    workload = null,
    department = DEFAULT_DEPARTMENT,
    college = DEFAULT_COLLEGE,
    sheetName = 'Class Program',
    logo = null,
    logo2 = null,
  } = opts;

  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31), {
    pageSetup: {
      // 5 day columns + the label gutter fit one portrait page wide; the form
      // has always been printed that way (matches the official .xls margins).
      orientation: 'portrait',
      horizontalCentered: true,
      verticalCentered: true,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9, // A4
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.25, header: 0, footer: 0 },
    },
  });
  const workloadAssignments = workload?.assignments;
  const workloadRowStart = ROW_TEACHING_LOAD + 2;
  const teachingSubtotalRow = workloadAssignments
    ? workloadRowStart + workloadAssignments.length
    : ROW_TEACHING_SUBTOTAL;
  const otherFunctionSectionShift = Math.max(
    0,
    teachingSubtotalRow - ROW_OTHER_FUNCTIONS + 1,
  );
  const designationTotals = workload?.designationTotals ?? [];
  const designationSectionShift = Math.max(0, designationTotals.length - 2);
  if (otherFunctionSectionShift > 0) {
    ws.spliceRows(
      ROW_OTHER_FUNCTIONS,
      0,
      ...Array.from({ length: otherFunctionSectionShift }, () => []),
    );
  }
  if (designationSectionShift > 0) {
    ws.spliceRows(
      ROW_DESIGNATION_SUBTOTAL + otherFunctionSectionShift,
      0,
      ...Array.from({ length: designationSectionShift }, () => []),
    );
  }
  const expandedRow = (row: number): number =>
    row +
    (row >= ROW_OTHER_FUNCTIONS ? otherFunctionSectionShift : 0) +
    (row >= ROW_DESIGNATION_SUBTOTAL ? designationSectionShift : 0);

  ws.columns = [
    { width: 18.33 }, // A - labels / time gutter (official width)
    { width: 19.66 }, // B-F - day columns (official width)
    { width: 19.66 },
    { width: 19.66 },
    { width: 19.66 },
    { width: 19.66 },
  ];

  const labelFont = (size: number, bold = false) => ({ name: 'Arial', size, bold });
  const put = (row: number, col: number, value: string, font = labelFont(10)): void => {
    const cell = ws.getCell(row, col);
    cell.value = value;
    cell.font = font;
  };

  // --- Header band 1: seal boxes, institution lines, doc-control block -------
  // The form's left edge is two separately boxed seal cells (A1:A7 and B1:B7
  // are independent merges), one per logo — matching the screen header.
  ws.mergeCells(ROW_SEAL_TOP, 1, ROW_SEAL_BOTTOM, 1);
  ws.mergeCells(ROW_SEAL_TOP, 2, ROW_SEAL_BOTTOM, 2);
  for (let row = ROW_SEAL_TOP; row <= ROW_SEAL_BOTTOM; row += 1) {
    for (let col = COL_LABEL; col <= COL_LABEL + 1; col += 1) {
      ws.getCell(row, col).border = { top: THIN, bottom: THIN, left: THIN, right: THIN };
    }
  }
  put(1, 3, INSTITUTION_LINES[0], labelFont(10, false));
  put(2, 3, INSTITUTION_LINES[1], labelFont(11, true));
  put(3, 3, INSTITUTION_LINES[2], labelFont(10, false));
  ws.mergeCells(1, 3, 1, 5);
  ws.mergeCells(2, 3, 2, 5);
  ws.mergeCells(3, 3, 3, 5);

  // Doc-control block down column F, exactly as the original writes it.
  const control: Array<[number, string]> = [
    [1, `Ref. Code : ${DEFAULT_REF_CODE}`],
    [2, `Rev. No.    : ${DEFAULT_REV_NO}`],
    [3, `Page No.   : ${DEFAULT_PAGE_NO}`],
    [4, `Date            : ${DEFAULT_DATE}`],
    [5, `Prep. By    : ${DEFAULT_PREP_BY}`],
    [6, `Rev. by      : ${DEFAULT_REV_BY}`],
    [7, `Appr. By   : ${DEFAULT_APP_BY}`],
  ];
  for (const [row, text] of control) put(row, 6, text, labelFont(9, false));

  // --- Header band 2: college + document title ------------------------------
  ws.mergeCells(ROW_COLLEGE, 3, ROW_COLLEGE, 5);
  put(ROW_COLLEGE, 3, college, labelFont(10, true));
  ws.mergeCells(ROW_TITLE, 3, ROW_TITLE_BOTTOM, 5);
  put(ROW_TITLE, 3, DOC_TITLE, labelFont(12, true));

  // --- Header band 3: Name / Term, Rank / Department, Effectivity / College --
  // The official form writes the second-column labels right-aligned, so they
  // carry the same leading padding the original workbook uses.
  const fields: Array<[row: number, labelCol: number, label: string, valueCol: number, value: string]> = [
    [9, 1, 'Name:', 2, faculty ? `${faculty.first_name} ${faculty.last_name}` : ''],
    [9, 4, '         Term:', 5, schoolYear ? officialTermLabel(schoolYear) : ''],
    [10, 1, faculty?.rank ? 'Academic Rank:' : 'Academic Rank:   _________________', 2, faculty?.rank ?? ''],
    [10, 4, '         Department:', 5, department],
    [11, 1, 'Effectivity:', 2, DEFAULT_DATE],
    [11, 4, '         College:', 5, college],
  ];
  for (const [row, labelCol, label, valueCol, value] of fields) {
    put(row, labelCol, label, labelFont(10, true));
    if (value) put(row, valueCol, value, labelFont(10, false));
    // Underline the value cells the way the form's blank fields read.
    const cell = ws.getCell(row, valueCol);
    cell.border = { ...(cell.border as object), bottom: THIN };
  }

  // The value cells of rows 9-11 span two columns on the official form.
  ws.mergeCells(9, 2, 9, 3);
  ws.mergeCells(9, 5, 9, 6);
  ws.mergeCells(10, 2, 10, 3);
  ws.mergeCells(10, 5, 10, 6);
  ws.mergeCells(11, 2, 11, 3);
  ws.mergeCells(11, 5, 11, 6);

  // --- Day header row (13) ---------------------------------------------------
  put(ROW_DAY_HEADER, 1, 'TIME / PERIOD', labelFont(10, true));
  ws.getCell(ROW_DAY_HEADER, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  OFFICIAL_DAYS.forEach((day, i) => {
    const cell = ws.getCell(ROW_DAY_HEADER, COL_FIRST_DAY + i);
    cell.value = FULL_DAY_LABELS[day];
    cell.font = labelFont(10, true);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: MEDIUM, bottom: MEDIUM, left: THIN, right: THIN };
  });
  ws.getRow(ROW_DAY_HEADER).height = 18;

  // --- Half-hour grid, time gutter, lunch band -------------------------------
  // The original prints one row per half hour from 7:00 to 7:00, EXCEPT the
  // lunch hour, which collapses into a single merged row (row 24). The row
  // labels therefore come from `rangeLabel`, not from a uniform loop.
  const gridRowCount = ROW_GRID_LAST - ROW_GRID_FIRST + 1; // 23 rows
  for (let i = 0; i < gridRowCount; i += 1) {
    const row = ROW_GRID_FIRST + i;
    const isLunch = row === ROW_LUNCH;
    const cell = ws.getCell(row, COL_LABEL);
    cell.value = rangeLabel(i);
    cell.font = labelFont(9, isLunch);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(row).height = GRID_ROW_HEIGHT;

    for (let col = COL_FIRST_DAY; col <= COL_LAST_DAY; col += 1) {
      const dayCell = ws.getCell(row, col);
      dayCell.font = labelFont(9);
      dayCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      dayCell.border = { top: THIN, bottom: THIN, left: THIN, right: THIN };
    }
    cell.border = { top: THIN, bottom: THIN, left: THIN, right: THIN };
  }

  // Lunch: one merged band across the five day columns, as on the form.
  ws.mergeCells(ROW_LUNCH, COL_FIRST_DAY, ROW_LUNCH, COL_LAST_DAY);
  const lunchCell = ws.getCell(ROW_LUNCH, COL_FIRST_DAY);
  lunchCell.value = 'L  U  N  C  H     B  R  E  A  K';
  lunchCell.font = labelFont(9, true);
  lunchCell.alignment = { horizontal: 'center', vertical: 'middle' };
  lunchCell.border = { top: MEDIUM, bottom: MEDIUM, left: THIN, right: THIN };

  // --- Placed classes: merged blocks in their day column ---------------------
  const dayColumn = new Map<DayOfWeek, number>();
  OFFICIAL_DAYS.forEach((day, i) => dayColumn.set(day, COL_FIRST_DAY + i));
  for (const slot of slots) {
    const col = dayColumn.get(slot.day_of_week);
    if (!col || !isDrawable(slot)) continue;
    const topRow = rowForMinutes(toMinutes(slot.start_time));
    const bottomRow = rowForMinutes(toMinutes(slot.end_time) - 1);
    if (bottomRow <= topRow) continue;

    if (bottomRow > topRow) ws.mergeCells(topRow, col, bottomRow, col);
    const anchor = ws.getCell(topRow, col);
    anchor.value = blockText(slot);
    anchor.font = labelFont(9, true);
    anchor.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    anchor.border = { top: MEDIUM, bottom: MEDIUM, left: THIN, right: THIN };
  }
  const otherFunctionLabels: Record<OtherFunctionType, string> = {
    RESEARCH: 'Research',
    EXTENSION: 'Extension',
    IMP: 'IMP',
    CONSULTATION: 'Consultation',
  };
  for (const session of otherFunctionSessions) {
    const col = dayColumn.get(session.day_of_week);
    if (!col || !isDrawable(session)) continue;
    const topRow = rowForMinutes(toMinutes(session.start_time));
    const bottomRow = rowForMinutes(toMinutes(session.end_time) - 1);
    if (bottomRow <= topRow) continue;

    if (bottomRow > topRow) ws.mergeCells(topRow, col, bottomRow, col);
    const anchor = ws.getCell(topRow, col);
    const typeLabel = otherFunctionLabels[session.functionType];
    anchor.value = session.title === typeLabel
      ? typeLabel
      : `${typeLabel}: ${session.title}`;
    anchor.font = labelFont(9, true);
    anchor.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    anchor.border = { top: MEDIUM, bottom: MEDIUM, left: THIN, right: THIN };
  }
  for (const session of designationSessions) {
    const col = dayColumn.get(session.day_of_week);
    if (!col || !isDrawable(session)) continue;
    const topRow = rowForMinutes(toMinutes(session.start_time));
    const bottomRow = rowForMinutes(toMinutes(session.end_time) - 1);
    if (bottomRow <= topRow) continue;

    ws.mergeCells(topRow, col, bottomRow, col);
    const anchor = ws.getCell(topRow, col);
    anchor.value = session.title === session.designationName
      ? session.designationName
      : `${session.designationName}: ${session.title}`;
    anchor.font = labelFont(9, true);
    anchor.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    anchor.border = { top: MEDIUM, bottom: MEDIUM, left: THIN, right: THIN };
  }

  // --- Footnote (37) and its blank spacer (38) -------------------------------
  ws.mergeCells(ROW_FOOTNOTE, 1, ROW_FOOTNOTE, COL_LAST_DAY);
  const footnote = ws.getCell(ROW_FOOTNOTE, 1);
  footnote.value = 'Indicate subject, year and section room, and number of students (Estimated)';
  footnote.font = labelFont(8, false);
  footnote.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.mergeCells(ROW_TABLE_SPACER, 1, ROW_TABLE_SPACER, COL_LAST_DAY);


  // --- Workload tables (rows 39-61) ------------------------------------------
  // A. Teaching Load - assignment rows show the weekly budgeted hours.
  ws.getRow(ROW_WORKLOAD_HEADER).height = 16;
  const workloadHeader: Array<[col: number, text: string]> = [
    [1, 'Workload'],
    [2, 'Lecture Hrs/Wk'],
    [3, 'Lab Hrs./Wk'],
    [4, 'Total'],
    [5, 'Remarks'],
  ];
  ws.mergeCells(ROW_WORKLOAD_HEADER, 5, ROW_WORKLOAD_HEADER, 6);
  for (const [col, text] of workloadHeader) {
    const cell = ws.getCell(ROW_WORKLOAD_HEADER, col);
    cell.value = text;
    cell.font = labelFont(9, true);
    cell.alignment = { horizontal: col === 1 ? 'left' : 'center', vertical: 'middle' };
    cell.border = { bottom: MEDIUM };
  }

  const lecture = workloadAssignments
    ? workloadAssignments.reduce(
        (sum, assignment) => roundHours(sum + assignment.lectureHrs),
        0,
      )
    : (workload?.lectureHrs ?? 0);
  const lab = workloadAssignments
    ? workloadAssignments.reduce(
        (sum, assignment) => roundHours(sum + assignment.labHrs),
        0,
      )
    : (workload?.labHrs ?? 0);
  const total = roundHours(lecture + lab);
  const numberCell = (row: number, col: number, value: number): void => {
    const cell = ws.getCell(row, col);
    cell.value = value;
    cell.font = labelFont(9);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: THIN };
  };
  const rowLabel = (row: number, text: string, bold = false): void => {
    const cell = ws.getCell(row, 1);
    cell.value = text;
    cell.font = labelFont(9, bold);
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
    cell.border = { bottom: THIN };
  };

  rowLabel(ROW_TEACHING_LOAD, 'A. Teaching Load:', true);
  numberCell(ROW_TEACHING_LOAD, 2, lecture);
  numberCell(ROW_TEACHING_LOAD, 3, lab);
  numberCell(ROW_TEACHING_LOAD, 4, total);
  workloadAssignments?.forEach((assignment, index) => {
    const row = ROW_TEACHING_LOAD + 2 + index;
    const label = [
      `${assignment.subjectCode} - ${assignment.subjectTitle}`,
      assignment.sectionLabel,
      assignment.facultyName,
    ].filter(Boolean).join('\n');
    rowLabel(row, label);
    ws.getCell(row, 1).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    ws.getRow(row).height = 30;
    numberCell(row, 2, assignment.lectureHrs);
    numberCell(row, 3, assignment.labHrs);
    numberCell(row, 4, roundHours(assignment.lectureHrs + assignment.labHrs));
  });
  const prepCell = ws.getCell(ROW_TEACHING_LOAD, 5);
  prepCell.value = 'No. of Preparations: ';
  prepCell.font = labelFont(9);
  // The count sits next to its label, in the second half of the Remarks span.
  const prepCount = ws.getCell(ROW_TEACHING_LOAD, 6);
  prepCount.value = workload?.numPreparations ?? 0;
  prepCount.font = labelFont(9);
  prepCount.alignment = { horizontal: 'center', vertical: 'middle' };
  // Service Credits and Teaching Overload are Remarks-column entries, not
  // section labels - the original form writes them down column E.
  const serviceCell = ws.getCell(ROW_SERVICE_CREDITS, 5);
  serviceCell.value = 'Service Credits:';
  serviceCell.font = labelFont(9);
  const overloadCell = ws.getCell(ROW_TEACHING_OVERLOAD, 5);
  overloadCell.value = 'Teaching Overload:';
  overloadCell.font = labelFont(9);
  rowLabel(teachingSubtotalRow, 'Sub-Total', true);
  numberCell(teachingSubtotalRow, 2, lecture);
  numberCell(teachingSubtotalRow, 3, lab);
  numberCell(teachingSubtotalRow, 4, total);

  const otherFunctionTotals = workload?.otherFunctionTotals ?? {
    RESEARCH: 0,
    EXTENSION: 0,
    IMP: 0,
    CONSULTATION: 0,
  };
  const otherFunctionTotal = Object.values(otherFunctionTotals).reduce(
    (sum, hours) => roundHours(sum + hours),
    0,
  );

  // B. Other Functions - weekly sessions and student count.
  rowLabel(expandedRow(ROW_OTHER_FUNCTIONS), 'B.  Other Functions:', true);
  const studentsCell = ws.getCell(expandedRow(ROW_OTHER_FUNCTIONS), 5);
  studentsCell.value = 'Total Number of Students:';
  studentsCell.font = labelFont(9, true);
  const otherFunctionRows: Array<[OtherFunctionType, string, number]> = [
    ['RESEARCH', 'Research', ROW_RESEARCH],
    ['EXTENSION', 'Extension', ROW_EXTENSION],
    ['IMP', 'IMP', ROW_IMP],
    ['CONSULTATION', 'Consultation', ROW_CONSULTATION],
  ];
  for (const [type, label, row] of otherFunctionRows) {
    rowLabel(expandedRow(row), label);
    numberCell(expandedRow(row), 2, otherFunctionTotals[type]);
    numberCell(expandedRow(row), 4, otherFunctionTotals[type]);
  }
  numberCell(expandedRow(ROW_RESEARCH), 5, workload?.totalStudents ?? 0);
  rowLabel(expandedRow(ROW_OTHER_SUBTOTAL), 'Sub-Total', true);
  numberCell(expandedRow(ROW_OTHER_SUBTOTAL), 2, otherFunctionTotal);
  numberCell(expandedRow(ROW_OTHER_SUBTOTAL), 4, otherFunctionTotal);

  // C. Designation - individual assigned designation totals.
  const designationHeaderRow = expandedRow(ROW_DESIGNATION);
  rowLabel(designationHeaderRow, 'C.  Designation', true);
  designationTotals.forEach((designation, index) => {
    const row = designationHeaderRow + index + 1;
    rowLabel(row, designation.name);
    numberCell(row, 2, designation.totalHours);
    numberCell(row, 4, designation.totalHours);
  });
  const designationSubtotalRow = Math.max(
    expandedRow(ROW_DESIGNATION_SUBTOTAL),
    designationHeaderRow + designationTotals.length + 1,
  );
  const designationTotal = designationTotals.reduce(
    (sum, designation) => roundHours(sum + designation.totalHours),
    0,
  );
  rowLabel(designationSubtotalRow, 'Sub-Total', true);
  numberCell(designationSubtotalRow, 2, designationTotal);
  numberCell(designationSubtotalRow, 4, designationTotal);

  // Grand Total (A+B+C).
  const grandTotalRow = expandedRow(ROW_GRAND_TOTAL);
  ws.mergeCells(grandTotalRow, 1, grandTotalRow, 3);
  const grandLabel = ws.getCell(grandTotalRow, 1);
  grandLabel.value = 'Grand Total (A+B+C)';
  grandLabel.font = labelFont(10, true);
  grandLabel.border = { top: MEDIUM, bottom: MEDIUM };
  numberCell(grandTotalRow, 4, roundHours(total + otherFunctionTotal + designationTotal));
  ws.getCell(grandTotalRow, 4).border = { top: MEDIUM, bottom: MEDIUM };



  // --- ACTION TAKEN approval block (rows 63-68) ------------------------------
  const approvalHeader: Array<[col: number, text: string]> = [
    [1, 'ACTION TAKEN'],
    [2, 'NAME'],
    [4, 'POSITION'],
    [6, 'SIGNATURE'],
  ];
  for (const [col, text] of approvalHeader) {
    const cell = ws.getCell(expandedRow(ROW_APPROVAL_HEADER), col);
    cell.value = text;
    cell.font = labelFont(9, true);
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
  }
  ws.mergeCells(expandedRow(ROW_APPROVAL_HEADER), 2, expandedRow(ROW_APPROVAL_HEADER), 3);
  ws.mergeCells(expandedRow(ROW_APPROVAL_HEADER), 4, expandedRow(ROW_APPROVAL_HEADER), 5);

  const approvals: Array<[row: number, label: string, position: string]> = [
    [ROW_PREPARED, 'Prepared by:', 'Faculty'],
    [ROW_REVIEWED, 'Reviewed by:', 'Chair'],
    [ROW_VERIFIED, 'Verified by:', 'Dean, COTE'],
    [ROW_APPROVED, 'Approved by:', 'VP-Academic Affairs'],
  ];
  for (const [row, label, position] of approvals) {
    put(expandedRow(row), 1, label, labelFont(9, false));
    put(expandedRow(row), 4, position, labelFont(9, false));
    ws.mergeCells(expandedRow(row), 2, expandedRow(row), 3);
    ws.mergeCells(expandedRow(row), 4, expandedRow(row), 5);
  }
  put(expandedRow(ROW_EFFECTIVE), 1, 'Effective: ___________', labelFont(9, false));

  // --- School seals, one per header logo box --------------------------------
  // The seal fills A1:A7 and the second logo B1:B7; the base64 guard stops a
  // degraded setup (both candidates resolving to the same file) from stamping
  // one logo into both boxes.
  const seals: Array<{ image: ExportImage; col: number }> = [];
  if (logo) seals.push({ image: logo, col: COL_LABEL });
  if (logo2 && logo2.base64 !== logo?.base64) {
    seals.push({ image: logo2, col: seals.length > 0 ? COL_LABEL + 1 : COL_LABEL });
  }
  for (const seal of seals) {
    placeLogo(wb, ws, seal.image, {
      topRow: ROW_SEAL_TOP,
      bottomRow: ROW_SEAL_BOTTOM,
      firstCol: seal.col,
      lastCol: seal.col,
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

/**
 * Download the official class program as an .xlsx file.
 *
 * The sheet is named after the instructor (surname) or "Master Timetable", and
 * the file name follows the same convention as the other exports.
 */
export async function downloadClassProgram(
  opts: ClassProgramExportOptions,
): Promise<void> {
  const {
    faculty = null,
    schoolYear = null,
    slots,
    otherFunctionSessions = [],
    workload = null,
    department = DEFAULT_DEPARTMENT,
    college = DEFAULT_COLLEGE,
    sheetName = 'Class Program',
    logo = null,
    logo2 = null,
  } = opts;

  const buffer = await buildClassProgramWorkbook({
    faculty,
    schoolYear,
    slots,
    otherFunctionSessions,
    workload,
    department,
    college,
    sheetName,
    logo,
    logo2,
  });
  const fileName = exportFileName(
    faculty ? `Class Program - ${faculty.last_name}` : 'Master Timetable',
    schoolYear,
  );
  downloadWorkbook(buffer, fileName);
}

/**
 * Build and download in one step, fetching the school seal when the caller did
 * not supply one. A missing logo must never fail the export.
 */
export async function exportClassProgram(
  opts: ClassProgramExportOptions,
): Promise<void> {
  const logo = opts.logo ?? (await loadSchoolLogo());
  // The header has two logo boxes; the second seal loads from the next public
  // candidate so the sheet shows the same two logos as the screen.
  const logo2 = opts.logo2 ?? (await loadSchoolLogo(SCHOOL_LOGO_CANDIDATES.slice(1)));
  await downloadClassProgram({ ...opts, logo, logo2 });
}
