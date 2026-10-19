import { fireEvent, render, screen, waitFor, within, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/Toast';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore, type AuthRole } from '../../store/auth.store';
import {
  listWorkloadAssignments,
  createWorkloadAssignment,
  updateWorkloadAssignment,
  deleteWorkloadAssignment,
} from '../../lib/workload-assignments';
import type { WorkloadAssignment, WorkloadAssignmentListMeta } from '../../lib/workload-assignments';
import { listFaculty, type FacultyMember } from '../../lib/faculty';
import { listSections, type Section } from '../../lib/sections';
import { listSubjects, type Subject } from '../../lib/subjects';
import { WorkloadAssignmentPage } from './WorkloadAssignmentPage';

vi.mock('../../lib/workload-assignments', () => ({
  listWorkloadAssignments: vi.fn(),
  createWorkloadAssignment: vi.fn(),
  updateWorkloadAssignment: vi.fn(),
  deleteWorkloadAssignment: vi.fn(),
}));

vi.mock('../../lib/faculty', () => ({ listFaculty: vi.fn() }));
vi.mock('../../lib/sections', () => ({ listSections: vi.fn() }));
vi.mock('../../lib/subjects', () => ({ listSubjects: vi.fn() }));

const listWorkloadAssignmentsMock = vi.mocked(listWorkloadAssignments);
const createWorkloadAssignmentMock = vi.mocked(createWorkloadAssignment);
const updateWorkloadAssignmentMock = vi.mocked(updateWorkloadAssignment);
const deleteWorkloadAssignmentMock = vi.mocked(deleteWorkloadAssignment);
const listFacultyMock = vi.mocked(listFaculty);
const listSectionsMock = vi.mocked(listSections);
const listSubjectsMock = vi.mocked(listSubjects);

const META: WorkloadAssignmentListMeta = { total: 1, page: 1, pageSize: 10, pageCount: 1 };

const ASSIGNMENT: WorkloadAssignment = {
  id: 'a-1',
  faculty_id: 'f-1',
  subject_id: 's-1',
  section_id: 'sec-1',
  term_id: 'term-1',
  faculty_name: 'Ada Lovelace',
  subject_code: 'IE 322',
  subject_title: 'Operations Research 1',
  subject_units: 3,
  section_label: 'BSIE 2A (Year 2)',
  term_label: '2026-2027 — 1st Sem',
  lecture_hours: 3,
  lab_hours: 3,
  scheduled_lecture_hours: 1.5,
  scheduled_lab_hours: 0,
  remaining_lecture_hours: 1.5,
  remaining_lab_hours: 3,
  weekly_hours: 6,
  scheduled_hours: 1.5,
  remaining_hours: 4.5,
  color: null,
  slots: [],
  created_at: '2026-09-01T00:00:00.000Z',
};

function setAuth(role: AuthRole): void {
  useAuthStore.setState({
    user: { id: 'u-1', email: 'user@faciload.local', role, facultyId: null },
    isAuthenticated: true,
    accessToken: 'test-access-token',
  });
}

function renderPage(): void {
  render(
    <MemoryRouter>
      <ToastProvider>
        <WorkloadAssignmentPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, isAuthenticated: false, accessToken: null });
});

afterEach(() => {
  cleanup();
});

describe('WorkloadAssignmentPage', () => {
  it('renders assignment rows from the API for a CHAIR session', async () => {
    setAuth('CHAIR');
    listWorkloadAssignmentsMock.mockResolvedValue({ data: [ASSIGNMENT], meta: META });
    renderPage();
    expect(await screen.findByText('IE 322')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ New Assignment' })).toBeInTheDocument();
  });

  it('shows the empty state when the filtered list has no rows', async () => {
    setAuth('CHAIR');
    listWorkloadAssignmentsMock.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, pageSize: 10, pageCount: 1 },
    });
    renderPage();
    expect(await screen.findByText('No assignments yet')).toBeInTheDocument();
  });

  it('surfaces a load error with a Retry affordance', async () => {
    setAuth('CHAIR');
    listWorkloadAssignmentsMock.mockRejectedValue(new Error('network down'));
    renderPage();
    expect(await screen.findByText("Couldn't load assignments.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});