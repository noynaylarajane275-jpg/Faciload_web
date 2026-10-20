/**
 * Module — Class Program page tests (official "INSTRUCTOR'S CLASS PROGRAM"
 * replica + Master Timetable). Confirms both modes fetch the right slots,
 * the official header/workload sections render for faculty view, a FACULTY
 * session is forced to its own program, the instructor filter switches the
 * master view to a single instructor, and the Print button opens the dialog.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { listFaculty, type FacultyMember } from '../lib/faculty';
import {
  listScheduleSlots,
  type ScheduleSlot,
  type ScheduleSlotListResult,
} from '../lib/schedule-slots';
import type { Term } from '../lib/terms';
import { useAuthStore, type AuthRole } from '../store/auth.store';
import { useTermStore } from '../store/term.store';
import { ToastProvider } from '../components/Toast';
import { ClassProgramPage } from './ClassProgramPage';

vi.mock('../lib/faculty', () => ({ listFaculty: vi.fn() }));
vi.mock('../lib/schedule-slots', () => ({ listScheduleSlots: vi.fn() }));

const listFacultyMock = vi.mocked(listFaculty);
const listScheduleSlotsMock = vi.mocked(listScheduleSlots);

const TERM: Term = {
  id: 'term-1',
  school_year: '2026-2027',
  semester: 'SECOND',
  is_active: true,
  label: '2026-2027 — 2nd Sem',
  created_at: '2026-09-01T00:00:00.000Z',
};

const FACULTY_A: FacultyMember = {
  id: 'fac-a',
  employee_no: 'TST-001',
  first_name: 'Ada',
  last_name: 'Lovelace',
  rank: 'Instructor I',
  employment_status: 'FULL_TIME',
  max_units: 24,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  user: null,
};

const FACULTY_B: FacultyMember = {
  ...FACULTY_A,
  id: 'fac-b',
  employee_no: 'TST-002',
  first_name: 'Grace',
  last_name: 'Hopper',
};

function slotFixture(overrides: Partial<ScheduleSlot> & { id: string }): ScheduleSlot {
  return {
    workload_assignment_id: 'wa-1',
    room_id: 'room-1',
    room_name: 'IE Room 1',
    day_of_week: 'MON',
    start_time: '07:00',
    end_time: '09:00',
    session_type: 'LECTURE',
    session_hours: 2,
    faculty_id: FACULTY_A.id,
    faculty_name: 'Ada Lovelace',
    subject_code: 'IE 21',
    subject_title: 'Operations Research 1',
    subject_units: 3,
    section_id: 'sec-1',
    section_label: '1A (Year 1)',
    term_id: TERM.id,
    color: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

const LECTURE_SLOT = slotFixture({ id: 'slot-1' });
const LAB_SLOT = slotFixture({
  id: 'slot-2',
  day_of_week: 'TUE',
  start_time: '13:00',
  end_time: '15:00',
  session_type: 'LAB',
  subject_code: 'IE 31',
  subject_title: 'Networking 1',
  faculty_id: FACULTY_B.id,
  faculty_name: 'Grace Hopper',
  section_label: '2B (Year 2)',
});

function slotsFixture(data: ScheduleSlot[]): ScheduleSlotListResult {
  return { data, meta: { total: data.length } };
}

function setAuth(role: AuthRole, facultyId: string | null): void {
  useAuthStore.setState({
    user: { id: 'u-1', email: 'user@faciload.local', role, facultyId },
    isAuthenticated: true,
    accessToken: 'test-access-token',
  });
}

function renderPage(entry: string): void {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/class-program" element={<ClassProgramPage />} />
          <Route path="/class-program/:facultyId" element={<ClassProgramPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

const printMock = vi.fn();

beforeEach(() => {
  useTermStore.setState({ terms: [TERM], selectedTermId: TERM.id, status: 'ready' });
  listFacultyMock.mockResolvedValue({
    data: [FACULTY_A, FACULTY_B],
    meta: { total: 2, page: 1, pageSize: 500, pageCount: 1 },
  });
  listScheduleSlotsMock.mockResolvedValue(slotsFixture([LECTURE_SLOT, LAB_SLOT]));
  Object.defineProperty(window, 'print', {
    value: printMock,
    writable: true,
    configurable: true,
  });
});

describe('ClassProgramPage', () => {
  it('renders the Master Timetable with every instructor’s slots (no faculty scope)', async () => {
    setAuth('CHAIR', null);
    renderPage('/class-program');

    expect(
      await screen.findByRole('heading', { name: 'Master Timetable' }),
    ).toBeInTheDocument();
    // Both instructors' blocks appear — no workload summary in master mode.
    expect(await screen.findByText('IE 21')).toBeInTheDocument();
    expect(screen.getByText('IE 31')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.queryByText('A. Teaching Load:')).not.toBeInTheDocument();
    expect(listScheduleSlotsMock).toHaveBeenCalledWith({ termId: TERM.id });
  });

  it('renders the official header, faculty grid and workload summary for /class-program/:facultyId', async () => {
    setAuth('CHAIR', null);
    listScheduleSlotsMock.mockResolvedValue(slotsFixture([LECTURE_SLOT]));
    renderPage(`/class-program/${FACULTY_A.id}`);

    // Official document header (rows 1–11 of the Excel workbook).
    expect(await screen.findByText('PALOMPON INSTITUTE OF TECHNOLOGY')).toBeInTheDocument();
    expect(screen.getByText("INSTRUCTOR'S CLASS PROGRAM")).toBeInTheDocument();
    const headerTable = screen.getByLabelText('Official document header');
    expect(within(headerTable).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(headerTable).getByText('Second Sem., S.Y. 2026-2027')).toBeInTheDocument();

    // Timetable + workload + approval area.
    expect(await screen.findByText('IE 21')).toBeInTheDocument();
    expect(screen.getByText('A. Teaching Load:')).toBeInTheDocument();
    expect(screen.getByText('No. of Preparations: 1')).toBeInTheDocument();
    expect(screen.getByText('Grand Total (A+B+C)')).toBeInTheDocument();
    expect(screen.getByText('ACTION TAKEN')).toBeInTheDocument();
    expect(screen.getByText('Approved by:')).toBeInTheDocument();
    expect(listScheduleSlotsMock).toHaveBeenCalledWith({
      termId: TERM.id,
      facultyId: FACULTY_A.id,
    });
  });

  it('splits lecture and lab hours by session type in the workload table', async () => {
    setAuth('CHAIR', null);
    listScheduleSlotsMock.mockResolvedValue(slotsFixture([LECTURE_SLOT, LAB_SLOT]));
    renderPage(`/class-program/${FACULTY_A.id}`);

    // 2 lecture hrs (07–09) + 2 lab hrs (13–15) = 4 total, 2 preparations.
    const loadRow = (await screen.findByText('A. Teaching Load:')).closest('tr');
    expect(loadRow).not.toBeNull();
    expect(loadRow?.textContent).toBe(
      'A. Teaching Load:224No. of Preparations: 2',
    );
    expect(screen.getByText('Grand Total (A+B+C)')).toBeInTheDocument();
  });

  it('pre-scopes a FACULTY session to its own program with no instructor filter', async () => {
    setAuth('FACULTY', FACULTY_A.id);
    renderPage('/class-program');

    expect(
      await screen.findByRole('heading', { name: 'Instructor Class Program' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Filter by instructor')).not.toBeInTheDocument();
    expect(await screen.findByText('IE 21')).toBeInTheDocument();
    expect(listScheduleSlotsMock).toHaveBeenCalledWith({
      termId: TERM.id,
      facultyId: FACULTY_A.id,
    });
  });

  it('switches the master view to one instructor via the filter and back', async () => {
    setAuth('CHAIR', null);
    renderPage('/class-program');

    const select = await screen.findByLabelText('Filter by instructor');
    await screen.findByRole('option', { name: /Hopper/ });
    fireEvent.change(select, { target: { value: FACULTY_B.id } });

    expect(
      await screen.findByRole('heading', { name: 'Instructor Class Program' }),
    ).toBeInTheDocument();
    expect(listScheduleSlotsMock).toHaveBeenLastCalledWith({
      termId: TERM.id,
      facultyId: FACULTY_B.id,
    });

    // Back to "All instructors" → master mode again.
    fireEvent.change(select, { target: { value: '' } });
    expect(
      await screen.findByRole('heading', { name: 'Master Timetable' }),
    ).toBeInTheDocument();
    expect(listScheduleSlotsMock).toHaveBeenLastCalledWith({ termId: TERM.id });
  });

  it('opens the print dialog from the Print / PDF button', async () => {
    setAuth('CHAIR', null);
    renderPage('/class-program');

    const button = await screen.findByRole('button', { name: 'Print / PDF' });
    fireEvent.click(button);
    expect(printMock).toHaveBeenCalledTimes(1);
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});