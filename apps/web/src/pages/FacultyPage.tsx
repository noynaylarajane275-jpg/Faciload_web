import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  createFaculty,
  deleteFaculty,
  listFaculty,
  updateFaculty,
  type FacultyListResult,
  type FacultyMember,
  type FacultySortBy,
  type FacultySortDir,
} from '../lib/faculty';
import {
  listWorkloadAssignments,
  type WorkloadAssignment,
} from '../lib/workload-assignments';
import { useAuthStore } from '../store/auth.store';

// Mirrors apps/api/src/validation/faculty.validation.ts: required names,
// optional rank, FULL_TIME|PART_TIME status, integer max_units in 1..99.
const facultyFormSchema = z.object({
  employee_no: z
    .string()
    .trim()
    .min(1, 'Employee no is required')
    .max(40, 'Employee no must be at most 40 characters'),
  first_name: z
    .string()
    .trim()
    .min(1, 'First name is required')
    .max(120, 'First name must be at most 120 characters'),
  last_name: z
    .string()
    .trim()
    .min(1, 'Last name is required')
    .max(120, 'Last name must be at most 120 characters'),
  rank: z.string().trim().max(120, 'Rank must be at most 120 characters').optional(),
  employment_status: z.enum(['FULL_TIME', 'PART_TIME'], {
    errorMap: () => ({ message: 'Employment status must be Full-time or Part-time' }),
  }),
  max_units: z.coerce
    .number({ invalid_type_error: 'Max units must be a number' })
    .int('Max units must be a whole number')
    .min(1, 'Max units must be greater than 0')
    .max(99, 'Max units must be 99 or less'),
});

/**
 * Optional login block (create only). Only validated when "create a login
 * account" is checked — mirrors apps/api faculty.validation.ts `account`.
 */
const accountFormSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be at most 128 characters'),
  })
  .strict();

interface AccountFormValues {
  enabled: boolean;
  email: string;
  password: string;
}

const EMPTY_ACCOUNT: AccountFormValues = { enabled: false, email: '', password: '' };

interface FacultyFormValues {
  employee_no: string;
  first_name: string;
  last_name: string;
  rank: string;
  employment_status: 'FULL_TIME' | 'PART_TIME';
  max_units: string;
}

const EMPTY_FORM: FacultyFormValues = {
  employee_no: '',
  first_name: '',
  last_name: '',
  rank: '',
  employment_status: 'FULL_TIME',
  max_units: '24',
};

type SortState = { sortBy: FacultySortBy; sortDir: FacultySortDir };

interface ModalState {
  mode: 'create' | 'edit' | 'closed';
  faculty: FacultyMember | null;
}

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Shared faculty directory. `manage = false` renders the view-only Faculty
 * module (browse records + per-member workload, zero mutation controls).
 * `manage = true` renders Faculty Management (create/edit/delete + opt-in
 * login provisioning); those actions still require the CHAIR role, exactly
 * as before the split.
 */
function FacultyDirectory({ manage }: { manage: boolean }): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const { pushToast } = useToast();
  const canEdit = manage && user?.role === 'CHAIR';

  const [result, setResult] = useState<FacultyListResult | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ sortBy: 'employee_no', sortDir: 'asc' });
  const [reloadKey, setReloadKey] = useState(0);

  const [modal, setModal] = useState<ModalState>({ mode: 'closed', faculty: null });
  const [formValues, setFormValues] = useState<FacultyFormValues>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FacultyFormValues, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Opt-in login provisioning (create only).
  const [account, setAccount] = useState<AccountFormValues>(EMPTY_ACCOUNT);
  const [accountErrors, setAccountErrors] = useState<Partial<Record<'email' | 'password', string>>>({});

  // Delete flow: removing a faculty member with an ACTIVE login also
  // deactivates that login, so the Chair must opt in explicitly
  // (backend enforces this with a 409 unless confirmLinkedUser).
  const [deletingFaculty, setDeletingFaculty] = useState<FacultyMember | null>(null);
  const [confirmLinkedUser, setConfirmLinkedUser] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Read-only workload linkage (Chair's answer: show assignments only — no
  // login provisioning from this page): a per-row view of one faculty
  // member's workload assignments across terms.
  const [workloadFaculty, setWorkloadFaculty] = useState<FacultyMember | null>(null);
  const [workload, setWorkload] = useState<{
    status: 'loading' | 'ready' | 'error';
    data: WorkloadAssignment[];
  }>({ status: 'loading', data: [] });

  const requestIdRef = useRef(0);

  // Debounced search (ui-ux.md §7: search filters the table without reload).
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    try {
      const res = await listFaculty({
        search: search || undefined,
        page,
        pageSize: 10,
        sortBy: sort.sortBy,
        sortDir: sort.sortDir,
      });
      if (requestId !== requestIdRef.current) {
        return; // a newer request superseded this one
      }
      // Deleting the last row of the last page can leave an empty page — clamp.
      if (res.meta.total > 0 && res.meta.pageCount < page) {
        setPage(res.meta.pageCount);
        return;
      }
      setResult(res);
      setStatus('ready');
    } catch {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setStatus('error');
    }
  }, [search, page, sort]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  function toggleSort(sortBy: FacultySortBy): void {
    setSort((current) =>
      current.sortBy === sortBy
        ? { sortBy, sortDir: current.sortDir === 'asc' ? 'desc' : 'asc' }
        : { sortBy, sortDir: 'asc' },
    );
  }

  function openCreate(): void {
    setFormValues(EMPTY_FORM);
    setFieldErrors({});
    setFormError(null);
    setAccount(EMPTY_ACCOUNT);
    setAccountErrors({});
    setModal({ mode: 'create', faculty: null });
  }

  function openEdit(faculty: FacultyMember): void {
    setFormValues({
      employee_no: faculty.employee_no,
      first_name: faculty.first_name,
      last_name: faculty.last_name,
      rank: faculty.rank ?? '',
      employment_status: faculty.employment_status,
      max_units: String(faculty.max_units),
    });
    setFieldErrors({});
    setFormError(null);
    setAccount(EMPTY_ACCOUNT);
    setAccountErrors({});
    setModal({ mode: 'edit', faculty });
  }

  function closeModal(): void {
    setModal({ mode: 'closed', faculty: null });
  }

  function openDelete(faculty: FacultyMember): void {
    setDeletingFaculty(faculty);
    setConfirmLinkedUser(false);
    setDeleteError(null);
  }

  function closeDelete(): void {
    if (deleting) {
      return;
    }
    setDeletingFaculty(null);
    setConfirmLinkedUser(false);
    setDeleteError(null);
  }

  /** Opens the read-only workload view for one faculty member (all terms). */
  async function openWorkload(faculty: FacultyMember): Promise<void> {
    setWorkloadFaculty(faculty);
    setWorkload({ status: 'loading', data: [] });
    try {
      const res = await listWorkloadAssignments({ facultyId: faculty.id, pageSize: 100 });
      setWorkload({ status: 'ready', data: res.data });
    } catch {
      setWorkload({ status: 'error', data: [] });
    }
  }

  function closeWorkload(): void {
    setWorkloadFaculty(null);
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    // Blank rank = "no rank" (sent as null, matching the nullable column).
    const parsed = facultyFormSchema.safeParse({
      ...formValues,
      rank: formValues.rank.trim() === '' ? undefined : formValues.rank,
    });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        employee_no: flat.employee_no?.[0],
        first_name: flat.first_name?.[0],
        last_name: flat.last_name?.[0],
        rank: flat.rank?.[0],
        employment_status: flat.employment_status?.[0],
        max_units: flat.max_units?.[0],
      });
      return;
    }
    setFieldErrors({});
    setFormError(null);
    setSaving(true);

    // Opt-in login (create only): validate the account block when the toggle is
    // on, and attach it to the payload so the API provisions the linked login.
    let accountPayload: { email: string; password: string } | undefined;
    if (modal.mode === 'create' && account.enabled) {
      const accountParsed = accountFormSchema.safeParse({
        email: account.email,
        password: account.password,
      });
      if (!accountParsed.success) {
        const flat = accountParsed.error.flatten().fieldErrors;
        setAccountErrors({
          email: flat.email?.[0],
          password: flat.password?.[0],
        });
        setSaving(false);
        return;
      }
      accountPayload = accountParsed.data;
    }
    setAccountErrors({});

    const payload = { ...parsed.data, rank: parsed.data.rank ?? null, ...(accountPayload ? { account: accountPayload } : {}) };
    try {
      if (modal.mode === 'create') {
        await createFaculty(payload);
        pushToast(
          'success',
          accountPayload
            ? `Faculty member created. Login: ${accountPayload.email}`
            : 'Faculty member created.',
        );
      } else if (modal.mode === 'edit' && modal.faculty) {
        await updateFaculty(modal.faculty.id, payload);
        pushToast('success', 'Faculty member saved.');
      }
      closeModal();
      setReloadKey((key) => key + 1); // refresh the table in place — no reload
    } catch (err) {
      // e.g. 409 duplicate employee_no / account email in use — shown inline.
      setFormError(err instanceof Error ? err.message : 'Could not save the faculty member.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deletingFaculty) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteFaculty(deletingFaculty.id, confirmLinkedUser);
      pushToast('success', 'Faculty member deleted.');
      setDeletingFaculty(null);
      setConfirmLinkedUser(false);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete the faculty member.');
    } finally {
      setDeleting(false);
    }
  }

  const rows = result?.data ?? [];
  const meta = result?.meta ?? null;
  // The delete warning only applies to an ACTIVE linked login.
  const activeLinkedUser =
    deletingFaculty?.user && deletingFaculty.user.is_active ? deletingFaculty.user : null;

  return (
    <section aria-labelledby="faculty-title">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 id="faculty-title" className="text-2xl font-semibold text-primary-dark">
            {manage ? 'Faculty Management' : 'Faculty'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {manage
              ? 'Create faculty records, update details, and manage linked login accounts.'
              : 'Browse faculty records, employment details, and per-member workload at a glance.'}
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={openCreate}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
          >
            Add Faculty Member
          </button>
        ) : null}
      </div>

      <div className="mt-4">
        <label htmlFor="faculty-search" className="block text-sm font-medium text-slate-700">
          Search
        </label>
        <input
          id="faculty-search"
          type="search"
          placeholder="Search by employee no or name…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          className="mt-1 w-full max-w-sm rounded border border-slate-300 px-3 py-2"
        />
      </div>

      {status === 'error' ? (
        <div role="alert" className="mt-6 rounded border border-red-300 bg-red-50 p-6 text-center">
          <p className="text-red-800">Couldn&apos;t load faculty.</p>
          <button
            type="button"
            onClick={() => {
              setStatus('loading');
              setReloadKey((key) => key + 1);
            }}
            className="mt-3 rounded border border-red-300 bg-surface px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      ) : null}

      {status === 'loading' ? (
        <div aria-busy="true" className="mt-6 space-y-2">
          <span className="sr-only">Loading faculty…</span>
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-10 animate-pulse rounded bg-surface-muted" />
          ))}
        </div>
      ) : null}

      {status === 'ready' ? (
        <>
          <table className="mt-4 w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th scope="col" aria-sort={sortHeaderState('employee_no', sort)} className="py-2 pr-4">
                  <SortButton label="Employee no" column="employee_no" sort={sort} onToggle={toggleSort} />
                </th>
                <th scope="col" aria-sort={sortHeaderState('last_name', sort)} className="py-2 pr-4">
                  <SortButton label="Name" column="last_name" sort={sort} onToggle={toggleSort} />
                </th>
                <th scope="col" className="py-2 pr-4">Rank</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" aria-sort={sortHeaderState('max_units', sort)} className="py-2 pr-4">
                  <SortButton label="Max units" column="max_units" sort={sort} onToggle={toggleSort} />
                </th>
                <th scope="col" className="py-2 pr-4">Linked login</th>
                <th scope="col" className="py-2 pr-4">Workload</th>
                {canEdit ? <th scope="col" className="py-2 pr-4">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="py-8 text-center text-slate-500">
                    {search ? 'No faculty match your search.' : 'No faculty records yet.'}
                  </td>
                </tr>
              ) : (
                rows.map((faculty) => (
                  <tr key={faculty.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-mono">{faculty.employee_no}</td>
                    <td className="py-2 pr-4">
                      {faculty.last_name}, {faculty.first_name}
                    </td>
                    <td className="py-2 pr-4">{faculty.rank ?? '—'}</td>
                    <td className="py-2 pr-4">
                      {faculty.employment_status === 'FULL_TIME' ? 'Full-time' : 'Part-time'}
                    </td>
                    <td className="py-2 pr-4">{faculty.max_units}</td>
                    <td className="py-2 pr-4">
                      {faculty.user
                        ? faculty.user.is_active
                          ? faculty.user.email
                          : `${faculty.user.email} (inactive)`
                        : '—'}
                    </td>
                    <td className="py-2 pr-4">
                      <button
                        type="button"
                        onClick={() => {
                          void openWorkload(faculty);
                        }}
                        className="text-primary-dark hover:underline"
                      >
                        View workload
                      </button>
                    </td>
                    {canEdit ? (
                      <td className="py-2 pr-4">
                        <button
                          type="button"
                          onClick={() => openEdit(faculty)}
                          className="text-primary-dark hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => openDelete(faculty)}
                          className="ml-3 text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {meta ? (
            <nav aria-label="Table pagination" className="mt-4 flex items-center gap-4 text-sm text-slate-600">
              <button
                type="button"
                disabled={meta.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
              >
                Previous
              </button>
              <span>
                Page {meta.page} of {meta.pageCount} · {meta.total} faculty
              </span>
              <button
                type="button"
                disabled={meta.page >= meta.pageCount}
                onClick={() => setPage((current) => current + 1)}
                className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </nav>
          ) : null}
        </>
      ) : null}

      <Modal
        open={modal.mode !== 'closed'}
        title={modal.mode === 'edit' ? 'Edit Faculty Member' : 'Add Faculty Member'}
        onClose={saving ? () => undefined : closeModal}
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="faculty-employee-no" className="block text-sm font-medium text-slate-700">
                Employee no
              </label>
              <input
                id="faculty-employee-no"
                type="text"
                value={formValues.employee_no}
                onChange={(event) => setFormValues((v) => ({ ...v, employee_no: event.target.value }))}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono"
              />
              {fieldErrors.employee_no ? (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.employee_no}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="faculty-max-units" className="block text-sm font-medium text-slate-700">
                Max units
              </label>
              <input
                id="faculty-max-units"
                type="number"
                min="1"
                max="99"
                step="1"
                value={formValues.max_units}
                onChange={(event) => setFormValues((v) => ({ ...v, max_units: event.target.value }))}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
              {fieldErrors.max_units ? (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.max_units}</p>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="faculty-first-name" className="block text-sm font-medium text-slate-700">
                First name
              </label>
              <input
                id="faculty-first-name"
                type="text"
                value={formValues.first_name}
                onChange={(event) => setFormValues((v) => ({ ...v, first_name: event.target.value }))}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
              {fieldErrors.first_name ? (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.first_name}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="faculty-last-name" className="block text-sm font-medium text-slate-700">
                Last name
              </label>
              <input
                id="faculty-last-name"
                type="text"
                value={formValues.last_name}
                onChange={(event) => setFormValues((v) => ({ ...v, last_name: event.target.value }))}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
              {fieldErrors.last_name ? (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.last_name}</p>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="faculty-rank" className="block text-sm font-medium text-slate-700">
                Rank
              </label>
              <input
                id="faculty-rank"
                type="text"
                placeholder="Optional — e.g. Instructor I"
                value={formValues.rank}
                onChange={(event) => setFormValues((v) => ({ ...v, rank: event.target.value }))}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
              {fieldErrors.rank ? <p className="mt-1 text-sm text-red-600">{fieldErrors.rank}</p> : null}
            </div>
            <div>
              <label htmlFor="faculty-status" className="block text-sm font-medium text-slate-700">
                Employment status
              </label>
              <select
                id="faculty-status"
                value={formValues.employment_status}
                onChange={(event) =>
                  setFormValues((v) => ({
                    ...v,
                    employment_status: event.target.value as FacultyFormValues['employment_status'],
                  }))
                }
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              >
                <option value="FULL_TIME">Full-time</option>
                <option value="PART_TIME">Part-time</option>
              </select>
              {fieldErrors.employment_status ? (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.employment_status}</p>
              ) : null}
            </div>
          </div>
          {modal.mode === 'create' ? (
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={account.enabled}
                  onChange={(event) =>
                    setAccount((a) => ({ ...a, enabled: event.target.checked }))
                  }
                />
                Create a login account for this faculty
              </label>
              <p className="mt-1 text-xs text-slate-500">
                They&apos;ll be able to sign in and see their own schedule &amp; workload
                automatically.
              </p>
              {account.enabled ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="faculty-account-email" className="block text-xs font-medium text-slate-700">
                      Account email
                    </label>
                    <input
                      id="faculty-account-email"
                      type="email"
                      autoComplete="off"
                      value={account.email}
                      onChange={(event) => setAccount((a) => ({ ...a, email: event.target.value }))}
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    />
                    {accountErrors.email ? (
                      <p className="mt-1 text-xs text-red-600">{accountErrors.email}</p>
                    ) : null}
                  </div>
                  <div>
                    <label htmlFor="faculty-account-password" className="block text-xs font-medium text-slate-700">
                      Temporary password
                    </label>
                    <input
                      id="faculty-account-password"
                      type="text"
                      autoComplete="off"
                      value={account.password}
                      onChange={(event) => setAccount((a) => ({ ...a, password: event.target.value }))}
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono"
                    />
                    {accountErrors.password ? (
                      <p className="mt-1 text-xs text-red-600">{accountErrors.password}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {formError ? (
            <p role="alert" className="text-sm text-red-600">
              {formError}
            </p>
          ) : null}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeModal}
              disabled={saving}
              className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={deletingFaculty !== null}
        title="Delete faculty member"
        onClose={deleting ? () => undefined : closeDelete}
      >
        {deletingFaculty ? (
          <div>
            <p className="text-sm text-slate-700">
              Delete {deletingFaculty.first_name} {deletingFaculty.last_name} (
              {deletingFaculty.employee_no})? This is a soft delete — historical workload records are
              preserved.
            </p>
            {activeLinkedUser ? (
              <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-800">
                  Warning: this faculty member has an active login ({activeLinkedUser.email}).
                </p>
                <label className="mt-2 flex items-start gap-2 text-sm text-amber-800">
                  <input
                    type="checkbox"
                    checked={confirmLinkedUser}
                    onChange={(event) => setConfirmLinkedUser(event.target.checked)}
                    className="mt-1"
                  />
                  <span>Also deactivate their login and remove the record</span>
                </label>
              </div>
            ) : null}
            {deleteError ? (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDelete}
                disabled={deleting}
                className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleDelete();
                }}
                disabled={deleting || (activeLinkedUser !== null && !confirmLinkedUser)}
                title={
                  activeLinkedUser && !confirmLinkedUser
                    ? 'Check the box above to confirm deactivating their login'
                    : undefined
                }
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Working…' : 'Delete'}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={workloadFaculty !== null}
        title={
          workloadFaculty
            ? `Workload — ${workloadFaculty.last_name}, ${workloadFaculty.first_name}`
            : 'Workload'
        }
        onClose={closeWorkload}
      >
        {workload.status === 'loading' ? (
          <p aria-busy="true" className="text-sm text-slate-600">
            Loading workload…
          </p>
        ) : workload.status === 'error' ? (
          <div>
            <p className="text-sm text-red-700">Couldn&apos;t load workload assignments.</p>
            <button
              type="button"
              onClick={() => {
                if (workloadFaculty) {
                  void openWorkload(workloadFaculty);
                }
              }}
              className="mt-3 rounded border border-slate-300 bg-surface px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
            >
              Retry
            </button>
          </div>
        ) : workload.data.length === 0 ? (
          <p className="text-sm text-slate-600">No workload assignments yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {workload.data.map((assignment) => (
              <li key={assignment.id} className="py-2">
                <p className="text-sm font-medium text-slate-800">
                  {assignment.subject_code} — {assignment.subject_title}
                </p>
                <p className="text-xs text-slate-500">
                  {assignment.section_label} · {assignment.term_label}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  {assignment.scheduled_hours}/{assignment.weekly_hours}h scheduled ·{' '}
                  {assignment.remaining_hours}h left · LEC {assignment.scheduled_lecture_hours}/
                  {assignment.lecture_hours}h · LAB {assignment.scheduled_lab_hours}/
                  {assignment.lab_hours}h
                </p>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </section>
  );
}

/** View-only Faculty module: browse records, search, and per-member workload. */
export function FacultyPage(): JSX.Element {
  return <FacultyDirectory manage={false} />;
}

/** Faculty Management module: create/edit/delete + opt-in login provisioning (CHAIR only). */
export function FacultyManagementPage(): JSX.Element {
  return <FacultyDirectory manage={true} />;
}

function sortHeaderState(column: FacultySortBy, sort: SortState): 'ascending' | 'descending' | 'none' {
  if (sort.sortBy !== column) {
    return 'none';
  }
  return sort.sortDir === 'asc' ? 'ascending' : 'descending';
}

function SortButton({
  label,
  column,
  sort,
  onToggle,
}: {
  label: string;
  column: FacultySortBy;
  sort: SortState;
  onToggle: (column: FacultySortBy) => void;
}): JSX.Element {
  const active = sort.sortBy === column;
  const arrow = active ? (sort.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <button
      type="button"
      onClick={() => onToggle(column)}
      className={`font-medium ${active ? 'text-primary-dark' : 'text-slate-600 hover:text-slate-900'}`}
    >
      {label}
      {arrow}
    </button>
  );
}





