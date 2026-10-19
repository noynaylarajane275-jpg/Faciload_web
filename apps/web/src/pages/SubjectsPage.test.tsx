/**
 * Module A — Subjects page UI tests (testing.md §4: forms, validation,
 * loading/error states, role-based controls, no-refresh behavior).
 */
import { fireEvent, render, screen, waitFor, within, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/Toast';
import { createSubject, deleteSubject, listSubjects, updateSubject } from '../lib/subjects';
import type { Subject } from '../lib/subjects';
import { useAuthStore, type AuthRole } from '../store/auth.store';
import { SubjectsPage } from './SubjectsPage';

vi.mock('../lib/subjects', () => ({
  listSubjects: vi.fn(),
  createSubject: vi.fn(),
  updateSubject: vi.fn(),
  deleteSubject: vi.fn(),
}));

const listSubjectsMock = vi.mocked(listSubjects);
const createSubjectMock = vi.mocked(createSubject);
const updateSubjectMock = vi.mocked(updateSubject);
const deleteSubjectMock = vi.mocked(deleteSubject);

const SUBJECT_A: Subject = {
  id: 'a-uuid',
  code: 'IE 105',
  title: 'Introduction to Industrial Engineering',
  units: 3,
  lecture_hours: 2,
  lab_hours: 0,
  created_at: '2026-09-14T00:00:00.000Z',
  updated_at: '2026-09-14T00:00:00.000Z',
};

const SUBJECT_B: Subject = {
  id: 'b-uuid',
  code: 'IE 322',
  title: 'Operations Research 1',
  units: 3,
  lecture_hours: 2,
  lab_hours: 0,
  created_at: '2026-09-14T00:00:00.000Z',
  updated_at: '2026-09-14T00:00:00.000Z',
};

const PAGE_OK = { data: [SUBJECT_A, SUBJECT_B], meta: { total: 2, page: 1, pageSize: 10, pageCount: 1 } };
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
      <SubjectsPage />
    </ToastProvider>,
  );
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  setRole('CHAIR');
  listSubjectsMock.mockResolvedValue(PAGE_OK);
  createSubjectMock.mockResolvedValue({ subject: SUBJECT_A });
  updateSubjectMock.mockResolvedValue({ subject: SUBJECT_A });
  deleteSubjectMock.mockResolvedValue(undefined);
});

function fillSubjectForm(values: { code: string; title: string; units: string; lecture_hours?: string; lab_hours?: string }): void {
  fireEvent.change(screen.getByLabelText('Subject code'), { target: { value: values.code } });
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: values.title } });
  fireEvent.change(screen.getByLabelText('Units'), { target: { value: values.units } });
  fireEvent.change(screen.getByLabelText('Lecture hrs'), {
    target: { value: values.lecture_hours ?? '0' },
  });
  fireEvent.change(screen.getByLabelText('Lab hrs'), { target: { value: values.lab_hours ?? '0' } });
}

describe('SubjectsPage — list rendering', () => {
  it('renders subjects from the API', async () => {
    renderPage();
    expect(await screen.findByText('IE 105')).toBeInTheDocument();
    expect(screen.getByText('Introduction to Industrial Engineering')).toBeInTheDocument();
    expect(screen.getByText('IE 322')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1 · 2 subjects')).toBeInTheDocument();
  });

  it('shows the catalog empty state (ui-ux.md §12)', async () => {
    listSubjectsMock.mockResolvedValue(PAGE_EMPTY);
    renderPage();
    expect(await screen.findByText('No subjects in the catalog yet.')).toBeInTheDocument();
  });

  it('shows a search empty state distinct from the catalog empty state', async () => {
    renderPage();
    await screen.findByText('IE 105');
    listSubjectsMock.mockResolvedValue(PAGE_EMPTY);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'nonexistent' } });
    expect(await screen.findByText('No subjects match your search.')).toBeInTheDocument();
  });

  it('shows an error state with a working Retry (ui-ux.md §13)', async () => {
    listSubjectsMock.mockRejectedValueOnce(new Error('network down'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load subjects.");
    listSubjectsMock.mockResolvedValueOnce(PAGE_OK);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('IE 105')).toBeInTheDocument();
  });

  it('sends a debounced search query', async () => {
    renderPage();
    await screen.findByText('IE 105');
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'operations' } });
    await waitFor(
      () => {
        expect(listSubjectsMock).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'operations' }));
      },
      { timeout: 1500 },
    );
  });

  it('sorts by the clicked column header', async () => {
    renderPage();
    await screen.findByText('IE 105');
    fireEvent.click(screen.getByRole('button', { name: 'Title' }));
    await waitFor(() => {
      expect(listSubjectsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: 'title', sortDir: 'asc' }),
      );
    });
  });
});

describe('SubjectsPage — role-based controls', () => {
  it('shows Add/Edit/Delete for the Chair', async () => {
    renderPage();
    await screen.findByText('IE 105');
    expect(screen.getByRole('button', { name: 'Add Subject' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
  });

  it('hides all edit controls from the Academic Admin (view-only)', async () => {
    setRole('ACADEMIC_ADMIN');
    renderPage();
    await screen.findByText('IE 105');
    expect(screen.queryByRole('button', { name: 'Add Subject' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });
});

describe('SubjectsPage — create', () => {
  it('creates a subject through the modal and refreshes in place', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add Subject' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Add Subject');
    fillSubjectForm({ code: 'IE 411', title: 'Methods Engineering', units: '4', lecture_hours: '2', lab_hours: '3' });
    const listCallsBefore = listSubjectsMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(createSubjectMock).toHaveBeenCalledWith({
        code: 'IE 411',
        title: 'Methods Engineering',
        units: 4,
        lecture_hours: 2,
        lab_hours: 3,
      });
    });
    expect(await screen.findByText(/Subject created\./)).toBeInTheDocument();
    // Table refreshes in place after the create (relative count — robust to
    // the initial load + clamped-page reload ordering).
    await waitFor(() => expect(listSubjectsMock.mock.calls.length).toBeGreaterThan(listCallsBefore));
  });

  it('shows inline validation for zero units and does not call the API', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add Subject' }));
    fillSubjectForm({ code: 'IE 000', title: 'Zero units', units: '0' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Units must be greater than 0')).toBeInTheDocument();
    expect(createSubjectMock).not.toHaveBeenCalled();
  });

  it('shows inline validation for over-cap hours and does not call the API', async () => {
    // One block holds at most 2 lecture hours / 3 lab hours — the form rejects
    // catalog data a single meeting could never hold.
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add Subject' }));
    fillSubjectForm({
      code: 'IE 999',
      title: 'Over cap',
      units: '3',
      lecture_hours: '3',
      lab_hours: '4',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Lecture hours cannot exceed 2 (one lecture block is at most 2h)'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Lab hours cannot exceed 3 (one lab block is at most 3h)'),
    ).toBeInTheDocument();
    expect(createSubjectMock).not.toHaveBeenCalled();
  });

  it('keeps the modal open and shows the server error for a duplicate code', async () => {
    createSubjectMock.mockRejectedValue(new Error('Subject code "IE 105" is already in use'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add Subject' }));
    fillSubjectForm({ code: 'IE 105', title: 'Duplicate', units: '3' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already in use');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('SubjectsPage — edit', () => {
  it('pre-fills the modal and saves edits in place', async () => {
    renderPage();
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[0] as HTMLElement);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Edit Subject');
    const titleInput = screen.getByLabelText('Title') as HTMLInputElement;
    expect(titleInput.value).toBe('Introduction to Industrial Engineering');
    fireEvent.change(titleInput, { target: { value: 'Intro to IE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(updateSubjectMock).toHaveBeenCalledWith(SUBJECT_A.id, {
        code: 'IE 105',
        title: 'Intro to IE',
        units: 3,
        lecture_hours: 2,
        lab_hours: 0,
      });
    });
    expect(await screen.findByText(/Subject saved\./)).toBeInTheDocument();
  });
});

describe('SubjectsPage — delete', () => {
  it('asks for confirmation first, then deletes and toasts', async () => {
    renderPage();
    const deleteButtons = await screen.findAllByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButtons[0] as HTMLElement);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete IE 105');
    expect(dialog).toHaveTextContent('This removes it from the catalog.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteSubjectMock).toHaveBeenCalledWith(SUBJECT_A.id));
    expect(await screen.findByText(/Subject deleted\./)).toBeInTheDocument();
  });
});