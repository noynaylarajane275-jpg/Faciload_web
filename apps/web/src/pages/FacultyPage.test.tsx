/**
 * Faculty module UI tests (mirrors SubjectsPage.test.tsx; Module B
 * specifics: linked-login delete warning + explicit confirmation checkbox).
 *
 * Phase 1: single Faculty Management directory (`/faculty`, role-gated
 * write controls). `/faculty-management` redirects to `/faculty` for
 * bookmarks; both exports below render the same component.
 */
import { fireEvent, render, screen, waitFor, within, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/Toast';
import {
  createFaculty,
  deleteFaculty,
  linkFacultyUser,
  listFaculty,
  listUnlinkedUsers,
  updateFaculty,
  type FacultyMember,
} from '../lib/faculty';
import {
  listWorkloadAssignments,
  type WorkloadAssignment,
} from '../lib/workload-assignments';
import { useAuthStore, type AuthRole } from '../store/auth.store';
import { FacultyPage, FacultyManagementPage } from './FacultyPage';

vi.mock('../lib/faculty', () => ({
  listFaculty: vi.fn(),
  createFaculty: vi.fn(),
  updateFaculty: vi.fn(),
  deleteFaculty: vi.fn(),
  listUnlinkedUsers: vi.fn(),
  linkFacultyUser: vi.fn(),
}));

vi.mock('../lib/workload-assignments', () => ({
  listWorkloadAssignments: vi.fn(),
}));

const listFacultyMock = vi.mocked(listFaculty);
const createFacultyMock = vi.mocked(createFaculty);
const updateFacultyMock = vi.mocked(updateFaculty);
const deleteFacultyMock = vi.mocked(deleteFaculty);

const FACULTY_A: FacultyMember = {
  id: 'fac-a',
  employee_no: 'TST-001',
  first_name: 'Maria',
  last_name: 'Ramos',
  rank: 'Instructor I',
  employment_status: 'FULL_TIME',
  max_units: 24,
  created_at: '2026-09-14T00:00:00.000Z',
  updated_at: '2026-09-14T00:00:00.000Z',
  user: null,
};

const FACULTY_B: FacultyMember = {
  id: 'fac-b',
  employee_no: 'TST-002',
  first_name: 'Juan',
  last_name: 'Dela Cruz',
  rank: null,
  employment_status: 'PART_TIME',
  max_units: 18,
  created_at: '2026-09-14T00:00:00.000Z',
  updated_at: '2026-09-14T00:00:00.000Z',
  user: { id: 'u-1', email: 'juan@faciload.local', role: 'FACULTY', is_active: true },
};

const PAGE_OK = { data: [FACULTY_A, FACULTY_B], meta: { total: 2, page: 1, pageSize: 10, pageCount: 1 } };
const PAGE_EMPTY = { data: [], meta: { total: 0, page: 1, pageSize: 10, pageCount: 1 } };

function setRole(role: AuthRole): void {
  useAuthStore.setState({
    user: { id: 'u-1', email: 'user@faciload.local', role, facultyId: null },
    isAuthenticated: true,
    accessToken: 'test-access-token',
  });
}

function renderPage(): void {
  render(
    <ToastProvider>
      <FacultyPage />
    </ToastProvider>,
  );
}

function renderManagePage(): void {
  render(
    <ToastProvider>
      <FacultyManagementPage />
    </ToastProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  setRole('CHAIR');
  listFacultyMock.mockResolvedValue(PAGE_OK);
  createFacultyMock.mockResolvedValue({ faculty: FACULTY_A });
  updateFacultyMock.mockResolvedValue({ faculty: FACULTY_A });
  deleteFacultyMock.mockResolvedValue(undefined);
  vi.mocked(listUnlinkedUsers).mockResolvedValue({ users: [] });
  vi.mocked(linkFacultyUser).mockResolvedValue({ faculty: FACULTY_A });
});

describe('FacultyPage — list rendering', () => {
  it('renders faculty from the API', async () => {
    renderPage();
    expect(await screen.findByText('TST-001')).toBeInTheDocument();
    expect(screen.getByText('Ramos, Maria')).toBeInTheDocument();
    expect(screen.getByText('Dela Cruz, Juan')).toBeInTheDocument();
    expect(screen.getByText('Instructor I')).toBeInTheDocument();
    expect(screen.getByText('Part-time')).toBeInTheDocument();
    expect(screen.getByText('juan@faciload.local')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1 · 2 faculty')).toBeInTheDocument();
  });

  it('shows the empty state (ui-ux.md §12)', async () => {
    listFacultyMock.mockResolvedValue(PAGE_EMPTY);
    renderPage();
    expect(await screen.findByText('No faculty records yet.')).toBeInTheDocument();
  });

  it('shows an error state with a working Retry (ui-ux.md §13)', async () => {
    listFacultyMock.mockRejectedValueOnce(new Error('network down'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load faculty.");
    listFacultyMock.mockResolvedValueOnce(PAGE_OK);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('TST-001')).toBeInTheDocument();
  });

  it('sorts by the clicked column header', async () => {
    renderPage();
    await screen.findByText('TST-001');
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    await waitFor(() => {
      expect(listFacultyMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: 'last_name', sortDir: 'asc' }),
      );
    });
  });
});

describe('FacultyManagementPage — role-based controls', () => {
  it('shows Add/Edit/Delete for the Chair', async () => {
    renderManagePage();
    await screen.findByText('TST-001');
    expect(screen.getByRole('button', { name: 'Add Faculty Member' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
  });

  it('shows the same edit controls to the Academic Admin', async () => {
    setRole('ACADEMIC_ADMIN');
    renderManagePage();
    await screen.findByText('TST-001');
    expect(screen.getByRole('button', { name: 'Add Faculty Member' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
  });
});

describe('FacultyManagementPage — create', () => {
  it('creates a faculty member through the modal with a blank rank sent as null', async () => {
    renderManagePage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add Faculty Member' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Add Faculty Member');
    fireEvent.change(screen.getByLabelText('Employee no'), { target: { value: 'TST-100' } });
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Lim' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(createFacultyMock).toHaveBeenCalledWith({
        employee_no: 'TST-100',
        first_name: 'Ana',
        last_name: 'Lim',
        rank: null,
        employment_status: 'FULL_TIME',
        max_units: 24,
      });
    });
    expect(await screen.findByText(/Faculty member created\./)).toBeInTheDocument();
    await waitFor(() => expect(listFacultyMock).toHaveBeenCalledTimes(2)); // initial load + refresh
  });

  it('shows inline validation for zero max units and does not call the API', async () => {
    renderManagePage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add Faculty Member' }));
    fireEvent.change(screen.getByLabelText('Employee no'), { target: { value: 'TST-101' } });
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Zero' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Units' } });
    fireEvent.change(screen.getByLabelText('Max units'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Max units must be greater than 0')).toBeInTheDocument();
    expect(createFacultyMock).not.toHaveBeenCalled();
  });

  it('shows inline validation for a missing required name', async () => {
    renderManagePage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add Faculty Member' }));
    fireEvent.change(screen.getByLabelText('Employee no'), { target: { value: 'TST-102' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('First name is required')).toBeInTheDocument();
    expect(createFacultyMock).not.toHaveBeenCalled();
  });

  it('keeps the modal open and shows the server error for a duplicate employee_no', async () => {
    createFacultyMock.mockRejectedValue(new Error('Employee no "TST-001" is already in use'));
    renderManagePage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add Faculty Member' }));
    fireEvent.change(screen.getByLabelText('Employee no'), { target: { value: 'TST-001' } });
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Dup' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Case' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already in use');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('links an existing registered account when chosen', async () => {
    vi.mocked(listUnlinkedUsers).mockResolvedValue({
      users: [{ id: 'u-pending', email: 'pending@faciload.local', role: 'FACULTY', created_at: '2026-09-14T00:00:00.000Z' }],
    });
    renderManagePage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add Faculty Member' }));
    fireEvent.change(screen.getByLabelText('Employee no'), { target: { value: 'TST-110' } });
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Link' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Me' } });
    fireEvent.click(screen.getByLabelText('Use an existing registered account'));
    await screen.findByLabelText('Registered account (awaiting approval)');
    fireEvent.change(screen.getByLabelText('Registered account (awaiting approval)'), { target: { value: 'u-pending' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(createFacultyMock).toHaveBeenCalledWith(expect.objectContaining({ existing_user_id: 'u-pending' }));
    });
  });
});

describe('FacultyManagementPage — edit', () => {
  it('pre-fills the modal and saves edits in place', async () => {
    renderManagePage();
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[0] as HTMLElement);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Edit Faculty Member');
    const firstNameInput = screen.getByLabelText('First name') as HTMLInputElement;
    expect(firstNameInput.value).toBe('Maria');
    fireEvent.change(firstNameInput, { target: { value: 'Maria Clara' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(updateFacultyMock).toHaveBeenCalledWith(
        FACULTY_A.id,
        expect.objectContaining({ first_name: 'Maria Clara', rank: 'Instructor I' }),
      );
    });
    expect(await screen.findByText(/Faculty member saved\./)).toBeInTheDocument();
  });
});

describe('FacultyManagementPage — delete', () => {
  it('deletes a faculty member without a login after confirmation', async () => {
    renderManagePage();
    const deleteButtons = await screen.findAllByRole('button', { name: 'Delete' });
    // First row (FACULTY_A) has no linked login.
    fireEvent.click(deleteButtons[0] as HTMLElement);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete Maria Ramos (TST-001)');
    expect(dialog).toHaveTextContent('historical workload records are preserved');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteFacultyMock).toHaveBeenCalledWith(FACULTY_A.id, false));
    expect(await screen.findByText(/Faculty member deleted\./)).toBeInTheDocument();
  });

  it('requires an explicit checkbox confirmation before deleting a faculty member with an active login', async () => {
    renderManagePage();
    const deleteButtons = await screen.findAllByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButtons[1] as HTMLElement); // FACULTY_B — has an active login
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(
      'Warning: this faculty member has an active login (juan@faciload.local).',
    );

    // Delete is disabled until the Chair checks the confirmation box.
    const confirmButton = within(dialog).getByRole('button', { name: 'Delete' });
    expect(confirmButton).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(confirmButton).toBeEnabled();

    fireEvent.click(confirmButton);
    await waitFor(() => expect(deleteFacultyMock).toHaveBeenCalledWith(FACULTY_B.id, true));
    expect(await screen.findByText(/Faculty member deleted\./)).toBeInTheDocument();
  });

  it('surfaces the backend guard message in the dialog when deletion is blocked by active workload assignments', async () => {
    deleteFacultyMock.mockRejectedValue(
      new Error('This faculty member has active workload assignments and cannot be removed'),
    );
    renderManagePage();
    const deleteButtons = await screen.findAllByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButtons[0] as HTMLElement); // FACULTY_A — no linked login
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    // The 409 guard message is surfaced verbatim inside the confirmation
    // dialog (not as a generic failure toast), and the dialog stays open.
    expect(await screen.findByRole('alert')).toHaveTextContent('active workload assignments');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText(/Faculty member deleted\./)).not.toBeInTheDocument();
  });
});

describe('FacultyManagementPage — role-based controls (FACULTY session)', () => {
  it('shows no create/edit/delete controls for a Faculty-role session', async () => {
    setRole('FACULTY');
    renderManagePage();
    await screen.findByText('TST-001');
    expect(screen.queryByRole('button', { name: 'Add Faculty Member' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });
});

describe('FacultyPage — single directory (role-gated management actions)', () => {
  it('shows Add/Edit/Delete controls to the Chair (Phase 1 consolidated directory)', async () => {
    renderPage(); // setRole('CHAIR') from beforeEach
    await screen.findByText('TST-001');
    expect(screen.getByRole('button', { name: 'Add Faculty Member' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
    // The directory still surfaces the read-only workload drill-down.
    expect(screen.getAllByRole('button', { name: 'View workload' })).toHaveLength(2);
  });
});

describe('FacultyPage — workload linkage (read-only)', () => {
  const ASSIGNMENT: WorkloadAssignment = {
    id: 'asg-1',
    faculty_id: 'fac-a',
    subject_id: 'sub-1',
    section_id: 'sec-1',
    term_id: 'term-1',
    faculty_name: 'Maria Ramos',
    subject_code: 'IE 322',
    subject_title: 'Operations Research 1',
    subject_units: 3,
    section_label: 'BSIE 2A (Year 2)',
    term_label: '2026-2027 — 1st Sem',
    lecture_hours: 2,
    lab_hours: 3,
    scheduled_lecture_hours: 2,
    scheduled_lab_hours: 0,
    remaining_lecture_hours: 0,
    remaining_lab_hours: 3,
    weekly_hours: 5,
    scheduled_hours: 2,
    remaining_hours: 3,
    color: null,
    slots: [],
    created_at: '2026-09-14T00:00:00.000Z',
  };

  it('opens a per-faculty modal listing that member’s assignments (read-only)', async () => {
    vi.mocked(listWorkloadAssignments).mockResolvedValue({
      data: [ASSIGNMENT],
      meta: { total: 1, page: 1, pageSize: 100, pageCount: 1 },
    });
    renderPage();
    await screen.findByText('TST-001');

    fireEvent.click(screen.getAllByRole('button', { name: 'View workload' })[0] as HTMLElement);
    const dialog = await screen.findByRole('dialog');

    expect(listWorkloadAssignments).toHaveBeenCalledWith({
      facultyId: 'fac-a',
      pageSize: 100,
    });
    expect(dialog).toHaveTextContent('Workload — Ramos, Maria');
    expect(dialog).toHaveTextContent('IE 322 — Operations Research 1');
    expect(dialog).toHaveTextContent('BSIE 2A (Year 2)');
    expect(dialog).toHaveTextContent('2026-2027 — 1st Sem');
    // Planned-vs-placed hours are readable without leaving the page.
    expect(dialog).toHaveTextContent('2/5h scheduled · 3h left');
    // Read-only: no edit affordances inside the modal.
    expect(within(dialog).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('shows an empty state when the member has no assignments yet', async () => {
    vi.mocked(listWorkloadAssignments).mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, pageSize: 100, pageCount: 1 },
    });
    renderPage();
    await screen.findByText('TST-001');

    fireEvent.click(screen.getAllByRole('button', { name: 'View workload' })[0] as HTMLElement);
    expect(await screen.findByRole('dialog')).toHaveTextContent('No workload assignments yet.');
  });
});

