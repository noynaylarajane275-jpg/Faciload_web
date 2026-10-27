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
import { exportClassProgram } from '../lib/class-program-export';
import {
  createOtherFunctionSession,
  deleteOtherFunctionSession,
  listOtherFunctionSessions,
  type OtherFunctionSession,
} from '../lib/other-function-sessions';
import {
  listWorkloadAssignments,
  type WorkloadAssignment,
} from '../lib/workload-assignments';
import {
  createDesignationSession,
  createFacultyDesignation,
  deleteDesignationSession,
  deleteFacultyDesignation,
  listFacultyDesignations,
  type FacultyDesignation,
} from '../lib/faculty-designations';
import type { Term } from '../lib/terms';
import { useAuthStore, type AuthRole } from '../store/auth.store';
import { useTermStore } from '../store/term.store';
import { ToastProvider } from '../components/Toast';
import { ClassProgramPage } from './ClassProgramPage';

vi.mock('../lib/faculty', () => ({ listFaculty: vi.fn() }));
vi.mock('../lib/schedule-slots', () => ({ listScheduleSlots: vi.fn() }));
vi.mock('../lib/class-program-export', () => ({ exportClassProgram: vi.fn() }));
vi.mock('../lib/other-function-sessions', () => ({
  createOtherFunctionSession: vi.fn(),
  deleteOtherFunctionSession: vi.fn(),
  listOtherFunctionSessions: vi.fn(),
}));
vi.mock('../lib/workload-assignments', () => ({ listWorkloadAssignments: vi.fn() }));
vi.mock('../lib/faculty-designations', () => ({
  createDesignationSession: vi.fn(),
  createFacultyDesignation: vi.fn(),
  deleteDesignationSession: vi.fn(),
  deleteFacultyDesignation: vi.fn(),
  listFacultyDesignations: vi.fn(),
}));

const listFacultyMock = vi.mocked(listFaculty);
const listScheduleSlotsMock = vi.mocked(listScheduleSlots);
const exportClassProgramMock = vi.mocked(exportClassProgram);
const createOtherFunctionSessionMock = vi.mocked(createOtherFunctionSession);
const deleteOtherFunctionSessionMock = vi.mocked(deleteOtherFunctionSession);
const listOtherFunctionSessionsMock = vi.mocked(listOtherFunctionSessions);
const listWorkloadAssignmentsMock = vi.mocked(listWorkloadAssignments);
const createDesignationSessionMock = vi.mocked(createDesignationSession);
const createFacultyDesignationMock = vi.mocked(createFacultyDesignation);
const deleteDesignationSessionMock = vi.mocked(deleteDesignationSession);
const deleteFacultyDesignationMock = vi.mocked(deleteFacultyDesignation);
const listFacultyDesignationsMock = vi.mocked(listFacultyDesignations);

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

function workloadAssignmentFixture(
  overrides: Partial<WorkloadAssignment> = {},
): WorkloadAssignment {
  return {
    id: 'assignment-1',
    faculty_id: FACULTY_A.id,
    subject_id: 'subject-1',
    section_id: 'section-1',
    term_id: TERM.id,
    faculty_name: 'Ada Lovelace',
    subject_code: 'IE 21',
    subject_title: 'Operations Research 1',
    subject_units: 3,
    section_label: '1A (Year 1)',
    term_label: '2026-2027 — 2nd Sem',
    lecture_hours: 3,
    lab_hours: 1,
    scheduled_lecture_hours: 0,
    scheduled_lab_hours: 0,
    remaining_lecture_hours: 3,
    remaining_lab_hours: 1,
    weekly_hours: 4,
    scheduled_hours: 0,
    remaining_hours: 4,
    color: null,
    slots: [],
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function otherFunctionFixture(
  overrides: Partial<OtherFunctionSession> = {},
): OtherFunctionSession {
  return {
    id: 'other-1',
    faculty_id: FACULTY_A.id,
    term_id: TERM.id,
    function_type: 'RESEARCH',
    title: 'Research project',
    day_of_week: 'MON',
    start_time: '10:00',
    end_time: '11:30',
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function designationFixture(
  overrides: Partial<FacultyDesignation> = {},
): FacultyDesignation {
  return {
    id: 'designation-1',
    faculty_id: FACULTY_A.id,
    term_id: TERM.id,
    name: 'Program Coordinator',
    total_hours: 1.5,
    sessions: [{
      id: 'designation-session-1',
      designation_id: 'designation-1',
      title: 'Coordination meeting',
      day_of_week: 'WED',
      start_time: '10:00',
      end_time: '11:30',
      created_at: '2026-09-01T00:00:00.000Z',
    }],
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

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
  listOtherFunctionSessionsMock.mockResolvedValue([]);
  listFacultyDesignationsMock.mockResolvedValue([]);
  createOtherFunctionSessionMock.mockResolvedValue({ session: otherFunctionFixture() });
  deleteOtherFunctionSessionMock.mockResolvedValue();
  createDesignationSessionMock.mockResolvedValue({
    session: designationFixture().sessions[0]!,
  });
  createFacultyDesignationMock.mockResolvedValue({
    designation: designationFixture({ sessions: [], total_hours: 0 }),
  });
  deleteDesignationSessionMock.mockResolvedValue();
  deleteFacultyDesignationMock.mockResolvedValue();
  listWorkloadAssignmentsMock.mockResolvedValue({
    data: [],
    meta: { total: 0, page: 1, pageSize: 100, pageCount: 1 },
  });
  exportClassProgramMock.mockResolvedValue();
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
    expect(screen.getByRole('button', { name: 'Add Other Functions' })).toBeInTheDocument();
  });

  it('shows other function sessions in the timetable, totals, and Excel export; creates and removes them', async () => {
    setAuth('FACULTY', FACULTY_A.id);
    listOtherFunctionSessionsMock.mockResolvedValue([
      otherFunctionFixture({ start_time: '10:00', end_time: '11:30' }),
      otherFunctionFixture({
        id: 'other-2',
        function_type: 'CONSULTATION',
        title: 'Student consultation',
        day_of_week: 'TUE',
        start_time: '14:00',
        end_time: '15:00',
      }),
    ]);
    renderPage('/class-program');

    expect(await screen.findByText('Research: Research project')).toBeInTheDocument();
    expect(screen.getByText('Consultation: Student consultation')).toBeInTheDocument();
    expect(screen.getByText('2.5', { selector: 'td' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Research project session' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export Excel' }));
    await screen.findByText('Excel file downloaded.');
    expect(exportClassProgramMock.mock.calls[0]?.[0].otherFunctionSessions).toEqual([
      {
        functionType: 'RESEARCH',
        title: 'Research project',
        day_of_week: 'MON',
        start_time: '10:00',
        end_time: '11:30',
      },
      {
        functionType: 'CONSULTATION',
        title: 'Student consultation',
        day_of_week: 'TUE',
        start_time: '14:00',
        end_time: '15:00',
      },
    ]);
    expect(exportClassProgramMock.mock.calls[0]?.[0].workload?.otherFunctionTotals).toEqual({
      RESEARCH: 1.5,
      EXTENSION: 0,
      IMP: 0,
      CONSULTATION: 1,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Other Functions' }));
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Function type'), { target: { value: 'IMP' } });
    fireEvent.change(screen.getByLabelText('Weekday'), { target: { value: 'WED' } });
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '15:00' } });
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '16:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Session' }));

    await screen.findByText('Other function session added.');
    expect(createOtherFunctionSessionMock).toHaveBeenCalledWith({
      term_id: TERM.id,
      function_type: 'IMP',
      day_of_week: 'WED',
      start_time: '15:00',
      end_time: '16:00',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Research project session' }));
    await screen.findByText('Other function session removed.');
    expect(deleteOtherFunctionSessionMock).toHaveBeenCalledWith('other-1');
  });

  it('lets Academic Admins assign designations to a selected faculty member', async () => {
    setAuth('ACADEMIC_ADMIN', null);
    listFacultyDesignationsMock.mockResolvedValue([designationFixture()]);
    renderPage(`/class-program/${FACULTY_A.id}`);

    expect(await screen.findByText('Program Coordinator: Coordination meeting')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Designation' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Designation Session' })).not.toBeInTheDocument();
    expect(screen.getByText('Program Coordinator', { exact: true }).closest('tr')?.textContent).toContain('1.5');

    fireEvent.click(screen.getByRole('button', { name: 'Add Designation' }));
    fireEvent.change(screen.getByLabelText('Designation name'), {
      target: { value: 'Program Coordinator' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Assign Designation' }));
    await screen.findByText('Designation assigned to the instructor.');
    expect(createFacultyDesignationMock).toHaveBeenCalledWith({
      faculty_id: FACULTY_A.id,
      term_id: TERM.id,
      name: 'Program Coordinator',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await screen.findByText('Designation removed.');
    expect(deleteFacultyDesignationMock).toHaveBeenCalledWith('designation-1');
  });

  it('lets Chairs assign designations to a selected faculty member', async () => {
    setAuth('CHAIR', null);
    renderPage(`/class-program/${FACULTY_A.id}`);

    expect(await screen.findByRole('button', { name: 'Add Designation' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Designation Session' })).not.toBeInTheDocument();
  });

  it('lets Faculty create and remove sessions only for their assigned designations', async () => {
    setAuth('FACULTY', FACULTY_A.id);
    listFacultyDesignationsMock.mockResolvedValue([designationFixture()]);
    renderPage('/class-program');

    expect(await screen.findByRole('button', { name: 'Add Designation Session' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Designation Session' }));
    expect(screen.queryByLabelText('Session title')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '13:00' } });
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '13:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Session' }));

    await screen.findByText('Designation session added.');
    expect(createDesignationSessionMock).toHaveBeenCalledWith({
      designation_id: 'designation-1',
      day_of_week: 'MON',
      start_time: '13:00',
      end_time: '13:30',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Coordination meeting designation session' }));
    await screen.findByText('Designation session removed.');
    expect(deleteDesignationSessionMock).toHaveBeenCalledWith('designation-session-1');
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

    await screen.findByText('IE 21');
    const button = screen.getByRole('button', { name: 'Print / PDF' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(printMock).toHaveBeenCalledTimes(1);
  });

  it('disables printing while schedule data is loading', () => {
    setAuth('CHAIR', null);
    listScheduleSlotsMock.mockReturnValue(new Promise(() => {}));
    renderPage('/class-program');

    expect(screen.getByRole('button', { name: 'Print / PDF' })).toBeDisabled();
  });

  it('exports every assignment page with each assignment weekly hours', async () => {
    setAuth('CHAIR', null);
    listWorkloadAssignmentsMock
      .mockResolvedValueOnce({
        data: [workloadAssignmentFixture()],
        meta: { total: 2, page: 1, pageSize: 1, pageCount: 2 },
      })
      .mockResolvedValueOnce({
        data: [
          workloadAssignmentFixture({
            id: 'assignment-2',
            subject_code: 'IE 31',
            subject_title: 'Networking 1',
            faculty_name: 'Grace Hopper',
            lecture_hours: 2,
            lab_hours: 3,
          }),
        ],
        meta: { total: 2, page: 2, pageSize: 1, pageCount: 2 },
      });
    renderPage('/class-program');

    fireEvent.click(await screen.findByRole('button', { name: 'Export Excel' }));

    await screen.findByText('Excel file downloaded.');
    expect(listWorkloadAssignmentsMock).toHaveBeenNthCalledWith(1, {
      termId: TERM.id,
      facultyId: undefined,
      page: 1,
      pageSize: 100,
    });
    expect(listWorkloadAssignmentsMock).toHaveBeenNthCalledWith(2, {
      termId: TERM.id,
      facultyId: undefined,
      page: 2,
      pageSize: 100,
    });
    const exportOptions = exportClassProgramMock.mock.calls[0]?.[0];
    expect(exportOptions?.workload?.assignments).toEqual([
      {
        subjectCode: 'IE 21',
        subjectTitle: 'Operations Research 1',
        sectionLabel: '1A (Year 1)',
        facultyName: 'Ada Lovelace',
        lectureHrs: 3,
        labHrs: 1,
      },
      {
        subjectCode: 'IE 31',
        subjectTitle: 'Networking 1',
        sectionLabel: '1A (Year 1)',
        facultyName: 'Grace Hopper',
        lectureHrs: 2,
        labHrs: 3,
      },
    ]);
    expect(exportOptions?.workload).toMatchObject({
      lectureHrs: 5,
      labHrs: 4,
      numPreparations: 2,
    });
  });

  it('does not show Add Other Functions to non-faculty roles', async () => {
    setAuth('CHAIR', null);
    renderPage('/class-program');

    await screen.findByRole('heading', { name: 'Master Timetable' });
    expect(screen.queryByRole('button', { name: 'Add Other Functions' })).not.toBeInTheDocument();
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});