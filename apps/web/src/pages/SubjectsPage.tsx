import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  createSubject,
  deleteSubject,
  listSubjects,
  updateSubject,
  type Subject,
  type SubjectListResult,
  type SubjectSortBy,
  type SubjectSortDir,
} from '../lib/subjects';
import { useAuthStore } from '../store/auth.store';
import { isManagementRole } from '../config/navigation';

// Mirrors apps/api/src/validation/subject.validation.ts (units > 0, hours >= 0).
const subjectFormSchema = z.object({
  code: z.string().trim().min(1, 'Subject code is required').max(40, 'Subject code must be at most 40 characters'),
  title: z.string().trim().min(1, 'Title is required').max(255, 'Title must be at most 255 characters'),
  units: z.coerce
    .number({ invalid_type_error: 'Units must be a number' })
    .positive('Units must be greater than 0')
    .max(99, 'Units must be 99 or less'),
  lecture_hours: z.coerce
    .number({ invalid_type_error: 'Lecture hours must be a number' })
    .min(0, 'Lecture hours cannot be negative')
    .max(2, 'Lecture hours cannot exceed 2 (one lecture block is at most 2h)'),
  lab_hours: z.coerce
    .number({ invalid_type_error: 'Lab hours must be a number' })
    .min(0, 'Lab hours cannot be negative')
    .max(3, 'Lab hours cannot exceed 3 (one lab block is at most 3h)'),
});

interface SubjectFormValues {
  code: string;
  title: string;
  units: string;
  lecture_hours: string;
  lab_hours: string;
}

const EMPTY_FORM: SubjectFormValues = { code: '', title: '', units: '', lecture_hours: '', lab_hours: '' };

type SortState = { sortBy: SubjectSortBy; sortDir: SubjectSortDir };

interface ModalState {
  mode: 'create' | 'edit' | 'closed';
  subject: Subject | null;
}

const SEARCH_DEBOUNCE_MS = 300;

export function SubjectsPage(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const { pushToast } = useToast();
  const canEdit = isManagementRole(user?.role);

  const [result, setResult] = useState<SubjectListResult | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ sortBy: 'code', sortDir: 'asc' });
  const [reloadKey, setReloadKey] = useState(0);

  const [modal, setModal] = useState<ModalState>({ mode: 'closed', subject: null });
  const [formValues, setFormValues] = useState<SubjectFormValues>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof SubjectFormValues, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deletingSubject, setDeletingSubject] = useState<Subject | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      const res = await listSubjects({
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

  function toggleSort(sortBy: SubjectSortBy): void {
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
    setModal({ mode: 'create', subject: null });
  }

  function openEdit(subject: Subject): void {
    setFormValues({
      code: subject.code,
      title: subject.title,
      units: String(subject.units),
      lecture_hours: String(subject.lecture_hours),
      lab_hours: String(subject.lab_hours),
    });
    setFieldErrors({});
    setFormError(null);
    setModal({ mode: 'edit', subject });
  }

  function closeModal(): void {
    setModal({ mode: 'closed', subject: null });
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const parsed = subjectFormSchema.safeParse(formValues);
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        code: flat.code?.[0],
        title: flat.title?.[0],
        units: flat.units?.[0],
        lecture_hours: flat.lecture_hours?.[0],
        lab_hours: flat.lab_hours?.[0],
      });
      return;
    }
    setFieldErrors({});
    setFormError(null);
    setSaving(true);
    try {
      if (modal.mode === 'create') {
        await createSubject(parsed.data);
        pushToast('success', 'Subject created.');
      } else if (modal.mode === 'edit' && modal.subject) {
        await updateSubject(modal.subject.id, parsed.data);
        pushToast('success', 'Subject saved.');
      }
      closeModal();
      setReloadKey((key) => key + 1); // refresh the table in place — no reload
    } catch (err) {
      // e.g. 409 duplicate code from the API — shown inline, modal stays open.
      setFormError(err instanceof Error ? err.message : 'Could not save the subject.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deletingSubject) {
      return;
    }
    setDeleting(true);
    try {
      await deleteSubject(deletingSubject.id);
      pushToast('success', 'Subject deleted.');
      setDeletingSubject(null);
      setReloadKey((key) => key + 1);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Could not delete the subject.');
    } finally {
      setDeleting(false);
    }
  }

  const rows = result?.data ?? [];
  const meta = result?.meta ?? null;

  return (
    <section aria-labelledby="subjects-title">
      <div className="flex items-center justify-between gap-4">
        <h1 id="subjects-title" className="text-2xl font-semibold text-primary-dark">
          Subjects
        </h1>
        {canEdit ? (
          <button
            type="button"
            onClick={openCreate}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
          >
            Add Subject
          </button>
        ) : null}
      </div>

      <div className="mt-4">
        <label htmlFor="subjects-search" className="block text-sm font-medium text-slate-700">
          Search
        </label>
        <input
          id="subjects-search"
          type="search"
          placeholder="Search by code or title…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          className="mt-1 w-full max-w-sm rounded border border-slate-300 px-3 py-2"
        />
      </div>

      {status === 'error' ? (
        <div role="alert" className="mt-6 rounded border border-red-300 bg-red-50 p-6 text-center">
          <p className="text-red-800">Couldn&apos;t load subjects.</p>
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
          <span className="sr-only">Loading subjects…</span>
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
                <th scope="col" aria-sort={sortHeaderState('code', sort)} className="py-2 pr-4">
                  <SortButton label="Code" column="code" sort={sort} onToggle={toggleSort} />
                </th>
                <th scope="col" aria-sort={sortHeaderState('title', sort)} className="py-2 pr-4">
                  <SortButton label="Title" column="title" sort={sort} onToggle={toggleSort} />
                </th>
                <th scope="col" aria-sort={sortHeaderState('units', sort)} className="py-2 pr-4">
                  <SortButton label="Units" column="units" sort={sort} onToggle={toggleSort} />
                </th>
                <th scope="col" className="py-2 pr-4">Lecture hrs</th>
                <th scope="col" className="py-2 pr-4">Lab hrs</th>
                {canEdit ? <th scope="col" className="py-2 pr-4">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 6 : 5} className="py-8 text-center text-slate-500">
                    {search ? 'No subjects match your search.' : 'No subjects in the catalog yet.'}
                  </td>
                </tr>
              ) : (
                rows.map((subject) => (
                  <tr key={subject.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-mono">{subject.code}</td>
                    <td className="py-2 pr-4">{subject.title}</td>
                    <td className="py-2 pr-4">{subject.units}</td>
                    <td className="py-2 pr-4">{subject.lecture_hours}</td>
                    <td className="py-2 pr-4">{subject.lab_hours}</td>
                    {canEdit ? (
                      <td className="py-2 pr-4">
                        <button
                          type="button"
                          onClick={() => openEdit(subject)}
                          className="text-primary-dark hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingSubject(subject)}
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
                Page {meta.page} of {meta.pageCount} · {meta.total} subject{meta.total === 1 ? '' : 's'}
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
        title={modal.mode === 'edit' ? 'Edit Subject' : 'Add Subject'}
        onClose={saving ? () => undefined : closeModal}
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <SubjectField
            id="subject-code"
            label="Subject code"
            icon={<TagIcon />}
            mono
            value={formValues.code}
            onChange={(value) => setFormValues((v) => ({ ...v, code: value }))}
            error={fieldErrors.code}
          />
          <SubjectField
            id="subject-title"
            label="Title"
            icon={<BookIcon />}
            value={formValues.title}
            onChange={(value) => setFormValues((v) => ({ ...v, title: value }))}
            error={fieldErrors.title}
          />
          <div className="grid grid-cols-3 gap-3">
            <SubjectField
              id="subject-units"
              label="Units"
              type="number"
              min="0"
              step="0.5"
              icon={<HashIcon />}
              value={formValues.units}
              onChange={(value) => setFormValues((v) => ({ ...v, units: value }))}
              error={fieldErrors.units}
            />
            <SubjectField
              id="subject-lecture-hours"
              label="Lecture hrs"
              type="number"
              min="0"
              step="0.5"
              icon={<ClockIcon />}
              value={formValues.lecture_hours}
              onChange={(value) => setFormValues((v) => ({ ...v, lecture_hours: value }))}
              error={fieldErrors.lecture_hours}
            />
            <SubjectField
              id="subject-lab-hours"
              label="Lab hrs"
              type="number"
              min="0"
              step="0.5"
              icon={<FlaskIcon />}
              value={formValues.lab_hours}
              onChange={(value) => setFormValues((v) => ({ ...v, lab_hours: value }))}
              error={fieldErrors.lab_hours}
            />
          </div>
          {formError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              <svg
                aria-hidden="true"
                className="mt-0.5 shrink-0"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" x2="12" y1="8" y2="12" />
                <line x1="12" x2="12.01" y1="16" y2="16" />
              </svg>
              <p>{formError}</p>
            </div>
          ) : null}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeModal}
              disabled={saving}
              className="rounded-lg border border-leaf-100 px-4 py-2 text-sm font-medium text-ink/70 transition-colors hover:bg-leaf-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-leaf-500 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:scale-[1.03] enabled:hover:bg-leaf-600 enabled:hover:text-white enabled:active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deletingSubject !== null}
        title="Delete subject"
        message={
          deletingSubject
            ? `Delete ${deletingSubject.code} — ${deletingSubject.title}? This removes it from the catalog.`
            : ''
        }
        pending={deleting}
        onConfirm={() => {
          void handleDelete();
        }}
        onCancel={() => setDeletingSubject(null)}
      />
    </section>
  );
}

function sortHeaderState(column: SubjectSortBy, sort: SortState): 'ascending' | 'descending' | 'none' {
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
  column: SubjectSortBy;
  sort: SortState;
  onToggle: (column: SubjectSortBy) => void;
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

/**
 * Icon-in-field form input (ui-ux.md Section 1.2): leading icon, hairline
 * `border-leaf-100`, focus state `border-leaf-500 ring-4 ring-leaf-500/15`.
 */
function SubjectField({
  id,
  label,
  icon,
  value,
  onChange,
  error,
  type = 'text',
  min,
  step,
  mono = false,
}: {
  id: string;
  label: string;
  icon: JSX.Element;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: 'text' | 'number';
  min?: string;
  step?: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-ink/70">
        {label}
      </label>
      <div className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-500/70">
          {icon}
        </span>
        <input
          id={id}
          type={type}
          min={min}
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`w-full rounded-xl border-[1.5px] border-leaf-100 bg-white/80 py-2.5 pl-10 pr-3.5 text-sm text-ink outline-none transition-colors focus:border-leaf-500 focus:bg-white focus:ring-4 focus:ring-leaf-500/15 ${
            mono ? 'font-mono' : ''
          }`}
        />
      </div>
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

const ICON_STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function TagIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" {...ICON_STROKE}>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

function BookIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" {...ICON_STROKE}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function HashIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" {...ICON_STROKE}>
      <line x1="4" x2="20" y1="9" y2="9" />
      <line x1="4" x2="20" y1="15" y2="15" />
      <line x1="10" x2="8" y1="3" y2="21" />
      <line x1="16" x2="14" y1="3" y2="21" />
    </svg>
  );
}

function ClockIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" {...ICON_STROKE}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function FlaskIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" {...ICON_STROKE}>
      <path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2" />
      <path d="M8.5 2h7" />
      <path d="M7 16h10" />
    </svg>
  );
}
