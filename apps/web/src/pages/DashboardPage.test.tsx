/**
 * Module — Dashboard page UI tests.
 * Chair / Academic Admin get the department dashboard (header + weekly
 * bars + term ring + utilization + load panel + week preview + rooms list);
 * FACULTY gets only the personal summary; loading, error-with-retry and
 * empty states.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/Toast';
import {
  getDashboardSummary,
  type DepartmentSummary,
  type PersonalSummary,
} from '../lib/dashboard';
import type { Term } from '../lib/terms';
import { useAuthStore, type AuthRole } from '../store/auth.store';
import { useTermStore } from '../store/term.store';
import { DashboardPage } from './DashboardPage';

// Keep the pure client-side validators real; stub the network calls only.
vi.mock('../lib/dashboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/dashboard')>();
  return {
    ...actual,
    getDashboardSummary: vi.fn(),
  };
});

const getDashboardSummaryMock = vi.mocked(getDashboardSummary);

const TERM: Term = {
  id: 'term-1',
  school_year: '2026-2027',
  semester: 'FIRST',
  is_active: true,
  label: '2026-2027 — 1st Sem',
  created_at: '2026-09-01T00:00:00.000Z',
};

const DEPARTMENT: DepartmentSummary = {
  scope: 'department',
  term_id: TERM.id,
  avatar_url: null,
  faculty_count: 24,
  subject_count: 41,
  room_count: 9,
  term_scheduled_percent: 72,
  rooms_in_use_percent: 55,
  weekly_plotted_hours: [
    { day_of_week: 'MON', hours: 12 },
    { day_of_week: 'TUE', hours: 9 },
    { day_of_week: 'WED', hours: 10 },
    { day_of_week: 'THU', hours: 8 },
    { day_of_week: 'FRI', hours: 6 },
    { day_of_week: 'SAT', hours: 3 },
  ],
  room_utilization: { booked_pct: 55, maintenance_pct: 11, free_pct: 34 },
  faculty_load: [
    {
      faculty_id: 'fac-over',
      employee_no: 'EMP-014',
      name: 'Ada Lovelace',
      avatar_url: null,
      scheduled_hours: 27,
      max_units: 24,
      load_ratio: 1.13,
      status: 'over',
    },
    {
      faculty_id: 'fac-near',
      employee_no: 'EMP-022',
      name: 'Blaise Pascal',
      avatar_url: null,
      scheduled_hours: 22,
      max_units: 24,
      load_ratio: 0.92,
      status: 'near',
    },
    {
      faculty_id: 'fac-ok',
      employee_no: 'EMP-031',
      name: 'Grace Hopper',
      avatar_url: null,
      scheduled_hours: 10,
      max_units: 24,
      load_ratio: 0.42,
      status: 'ok',
    },
  ],
  near_or_over_count: 2,
  this_week_preview: {
    room_id: 'room-1',
    room_name: 'IE Room 1',
    slots: [
      {
        day_of_week: 'MON',
        start_time: '07:00',
        end_time: '09:00',
        subject_code: 'IE 101',
        section_label: 'BSIE 1A (Year 1)',
        session_type: 'LECTURE',
      },
    ],
  },
  rooms_status: [
    { room_id: 'room-1', room_name: 'IE Room 1', status: 'booked_now' },
    { room_id: 'room-2', room_name: 'IE Lab 1', status: 'available' },
    { room_id: 'room-7', room_name: 'IE Lab 2', status: 'maintenance' },
  ],
  total_faculty: 24,
  total_subjects: 41,
  total_sections: 12,
  total_rooms: 9,
  faculty_near_or_over_load: [],
  rooms_under_maintenance: [],
  most_booked_rooms: [],
  unscheduled_assignments_count: 5,
};

const PERSONAL: PersonalSummary = {
  scope: 'personal',
  term_id: TERM.id,
  avatar_url: null,
  faculty_id: 'fac-1',
  faculty_name: 'Ada Lovelace',
  my_total_hours: 21,
  my_scheduled_hours: 18,
  my_remaining_hours: 3,
  max_units: 24,
  load_ratio: 0.75,
  load_status: 'ok',
  my_subjects_count: 4,
  todays_classes: [
    {
      day_of_week: 'MON',
      start_time: '07:00',
      end_time: '09:00',
      subject_code: 'IE 322',
      subject_title: 'Operations Research 1',
      section_label: 'BSIE 2A (Year 2)',
      room_name: 'IE Room 1',
    },
  ],
  my_next_class: {
    day_of_week: 'MON',
    start_time: '07:00',
    end_time: '09:00',
    subject_code: 'IE 322',
    subject_title: 'Operations Research 1',
    section_label: 'BSIE 2A (Year 2)',
    room_name: 'IE Room 1',
  },
};

function setAuth(role: AuthRole, facultyId: string | null = null): void {
  useAuthStore.setState({
    user: { id: 'u-1', email: 'user@faciload.local', role, facultyId },
    isAuthenticated: true,
    accessToken: 'test-access-token',
  });
}

function renderPage(): void {
  render(
    <MemoryRouter>
      <ToastProvider>
        <DashboardPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useTermStore.setState({ terms: [TERM], selectedTermId: TERM.id, status: 'ready' });
  useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null });
});

afterEach(() => {
  cleanup();
});

describe('DashboardPage', () => {
  it('renders the department dashboard (faculty load panel) for a management session', async () => {
    setAuth('CHAIR');
    getDashboardSummaryMock.mockResolvedValue({ summary: DEPARTMENT });
    renderPage();
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Blaise Pascal')).toBeInTheDocument();
  });

  it('renders the personal summary for a FACULTY session', async () => {
    setAuth('FACULTY', 'fac-1');
    getDashboardSummaryMock.mockResolvedValue({ summary: PERSONAL });
    renderPage();
    expect(await screen.findByText(/Next class: IE 322/)).toBeInTheDocument();
  });

  it('shows a Retry affordance when the summary fails to load', async () => {
    setAuth('CHAIR');
    getDashboardSummaryMock.mockRejectedValue(new Error('network down'));
    renderPage();
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
