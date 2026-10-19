/**
 * Module — Faculty Schedule view tests ("Faculty Class Program").
 * Confirms the page renders the fetched view rows into the Mon–Sat grid
 * (subject + section + room per block), that a FACULTY-role session is
 * pre-scoped to its own schedule with no picker, and that the empty state
 * shows when nothing is scheduled.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listFaculty, type FacultyMember } from '../../lib/faculty';
import {
  getFacultySchedule,
  type ScheduleViewSlot,
  type FacultyScheduleView,
} from '../../lib/schedule-views';
import type { Term } from '../../lib/terms';
import { useAuthStore, type AuthRole } from '../../store/auth.store';
import { useTermStore } from '../../store/term.store';
import { FacultySchedulePage } from './FacultySchedulePage';

vi.mock('../../lib/faculty', () => ({ listFaculty: vi.fn() }));
vi.mock('../../lib/schedule-views', () => ({ getFacultySchedule: vi.fn() }));

const listFacultyMock = vi.mocked(listFaculty);
const getFacultyScheduleMock = vi.mocked(getFacultySchedule);

const TERM: Term = {
  id: 'term-1',
  school_year: '2026-2027',
  semester: 'FIRST',
  is_active: true,
  label: '2026-2027 — 1st Sem',
  created_at: '2026-09-01T00:00:00.000Z',
};

const FACULTY_A: FacultyMember = {
  id: 'fac-a',
  employee_no: 'TST-001',
  first_name: 'Ada',
  last_name: 'Lovelace',
  rank: null,
  employment_status: 'FULL_TIME',
  max_units: 24,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  user: null,
};

const FACULTY_ROWS: ScheduleViewSlot[] = [
  {
    day_of_week: 'MON',
    start_time: '07:00',
    end_time: '09:00',
    subject_code: 'IE 21',
    subject_title: 'Operations Research 1',
    faculty_name: 'Ada Lovelace',
    section_name: '1A (Year 1)',
    room_name: 'IE Room 1',
    color: null,
  },
  {
    day_of_week: 'TUE',
    start_time: '13:00',
    end_time: '15:00',
    subject_code: 'IE 31',
    subject_title: 'Operations Research 2',
    faculty_name: 'Ada Lovelace',
    section_name: '2B (Year 2)',
    room_name: null,
    color: null,
  },
];

function viewFixture(data: ScheduleViewSlot[]): FacultyScheduleView {
  return {
    faculty: {
      id: FACULTY_A.id,
      employee_no: FACULTY_A.employee_no,
      first_name: FACULTY_A.first_name,
      last_name: FACULTY_A.last_name,
      name: 'Ada Lovelace',
    },
    data,
    meta: { total: data.length },
  };
}

function setAuth(role: AuthRole, facultyId: string | null): void {
  useAuthStore.setState({
    user: { id: 'u-1', email: 'user@faciload.local', role, facultyId },
    isAuthenticated: true,
    accessToken: 'test-access-token',
  });
}

beforeEach(() => {
  useTermStore.setState({ terms: [TERM], selectedTermId: TERM.id, status: 'ready' });
  listFacultyMock.mockResolvedValue({
    data: [FACULTY_A],
    meta: { total: 1, page: 1, pageSize: 100, pageCount: 1 },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * The picker's options come from an async faculty fetch, so wait for the
 * option to exist *before* changing the select: a `change` whose value has no
 * matching `<option>` yet is silently dropped by the DOM (the select falls
 * back to ""), which made this suite flaky under parallel load.
 */
async function pickFaculty(): Promise<void> {
  const select = await screen.findByLabelText('Select faculty');
  await screen.findByRole('option', { name: /Lovelace/ });
  fireEvent.change(select, { target: { value: FACULTY_A.id } });
}

describe('FacultySchedulePage', () => {
  it('renders the picked faculty member\'s slots into the grid (management picks anyone)', async () => {
    setAuth('CHAIR', null);
    getFacultyScheduleMock.mockResolvedValue(viewFixture(FACULTY_ROWS));
    render(<FacultySchedulePage />);
    await pickFaculty();

    expect(await screen.findByText('IE 21')).toBeInTheDocument();
    expect(screen.getByText('1A (Year 1)')).toBeInTheDocument();
    expect(screen.getByText('IE Room 1')).toBeInTheDocument();
    expect(screen.getByText('IE 31')).toBeInTheDocument();
    expect(screen.getByText('2B (Year 2)')).toBeInTheDocument();
    expect(screen.getByText('TBA')).toBeInTheDocument();
    expect(getFacultyScheduleMock).toHaveBeenCalledWith(FACULTY_A.id, TERM.id);
  });

  it('pre-scopes a FACULTY-role session to its own schedule with no picker', async () => {
    setAuth('FACULTY', FACULTY_A.id);
    getFacultyScheduleMock.mockResolvedValue(viewFixture(FACULTY_ROWS));
    render(<FacultySchedulePage />);

    // No picker for faculty-role users — they land directly on their own grid.
    expect(screen.queryByLabelText('Select faculty')).not.toBeInTheDocument();
    expect(await screen.findByText('IE 21')).toBeInTheDocument();
    expect(screen.getByText('1A (Year 1)')).toBeInTheDocument();
    expect(screen.getByText('IE 31')).toBeInTheDocument();
    // Only their own schedule is ever requested.
    expect(getFacultyScheduleMock).toHaveBeenCalledTimes(1);
    expect(getFacultyScheduleMock).toHaveBeenCalledWith(FACULTY_A.id, TERM.id);
  });

  it('shows the empty state when the faculty member has no scheduled slots for the term', async () => {
    setAuth('CHAIR', null);
    getFacultyScheduleMock.mockResolvedValue(viewFixture([]));
    render(<FacultySchedulePage />);
    await pickFaculty();
    expect(await screen.findByText('No classes scheduled yet for this term.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Weekly schedule grid')).not.toBeInTheDocument();
  });
});
