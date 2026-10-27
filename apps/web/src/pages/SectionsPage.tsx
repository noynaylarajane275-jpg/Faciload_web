import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  createSection,
  deleteSection,
  listSections,
  updateSection,
  type Section,
} from '../lib/sections';
import { useAuthStore } from '../store/auth.store';
import { isManagementRole } from '../config/navigation';

// Mirrors apps/api/src/validation/section.validation.ts (year 1-4, name <= 60, size 1-500).
const sectionFormSchema = z.object({
  year_level: z.coerce
    .number({ invalid_type_error: 'Year level must be a number' })
    .int('Year level must be a whole number')
    .min(1, 'Year level must be at least 1')
    .max(4, 'Year level must be at most 4'),
  name: z
    .string()
    .trim()
    .min(1, 'Section name is required')
    .max(60, 'Section name must be at most 60 characters'),
  size: z.coerce
    .number({ invalid_type_error: 'Size must be a number' })
    .int('Size must be a whole number')
    .min(1, 'Size must be at least 1')
    .max(500, 'Size must be at most 500'),
});

interface SectionFormValues {
  year_level: string;
  name: string;
  size: string;
}

const EMPTY_FORM: SectionFormValues = { year_level: '', name: '', size: '' };

interface ModalState {
  mode: 'create' | 'edit' | 'closed';
  section: Section | null;
}

const SEARCH_DEBOUNCE_MS = 300;
const YEAR_OPTIONS = [1, 2, 3, 4];

const inputClass =
  'w-full rounded-xl border-[1.5px] border-leaf-100 bg-white/80 px-3.5 py-2.5 text-sm text-ink outline-none transition-colors focus:border-leaf-500 focus:bg-white focus:ring-4 focus:ring-leaf-500/15';

export function SectionsPage(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const { pushToast } = useToast();
  const canEdit = isManagementRole(user?.role);

  const [sections, setSections] = useState<Section[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [modal, setModal] = useState<ModalState>({ mode: 'closed', section: null });
  const [formValues, setFormValues] = useState<SectionFormValues>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof SectionFormValues, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deletingSection, setDeletingSection] = useState<Section | null>(null);
  const [deleting, setDeleting] = useState(false);

  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    try {
      const res = await listSections({
        search: search || undefined,
        year_level: yearFilter ?? undefined,
      });
      if (requestId !== requestIdRef.current) {
        return;
      }
      setSections(res.data);
      setStatus('ready');
    } catch {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setStatus('error');
    }
  }, [search, yearFilter]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  function closeModal(): void {
    setModal({ mode: 'closed', section: null });
  }

  function openCreate(): void {
    setFormValues(EMPTY_FORM);
    setFieldErrors({});
    setFormError(null);
    setModal({ mode: 'create', section: null });
  }

  function openEdit(section: Section): void {
    setFormValues({ year_level: String(section.year_level), name: section.name, size: String(section.size) });
    setFieldErrors({});
    setFormError(null);
    setModal({ mode: 'edit', section });
  }

  function setField<K extends keyof SectionFormValues>(key: K, value: SectionFormValues[K]): void {
    setFormValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (current[key] === undefined) {
        return current;
      }
      const next = { ...current };
      delete next[key];
      return next;
    });
  }
  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const parsed = sectionFormSchema.safeParse(formValues);
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        year_level: flat.year_level?.[0],
        name: flat.name?.[0],
        size: flat.size?.[0],
      });
      return;
    }
    setFieldErrors({});
    setFormError(null);
    setSaving(true);
    try {
      if (modal.mode === 'create') {
        await createSection({
          year_level: parsed.data.year_level,
          name: parsed.data.name,
          size: parsed.data.size,
        });
        pushToast('success', 'Section added.');
      } else if (modal.mode === 'edit' && modal.section) {
        await updateSection(modal.section.id, {
          year_level: parsed.data.year_level,
          name: parsed.data.name,
          size: parsed.data.size,
        });
        pushToast('success', 'Section saved.');
      }
      closeModal();
      setReloadKey((key) => key + 1);
    } catch (err) {
      // 409 SECTION_DUPLICATE lands here — shown inline, modal stays open.
      setFormError(err instanceof Error ? err.message : 'Could not save the section.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deletingSection || deleting) {
      return;
    }
    setDeleting(true);
    try {
      await deleteSection(deletingSection.id);
      setDeletingSection(null);
      pushToast('success', 'Section deleted.');
      setReloadKey((key) => key + 1);
    } catch (err) {
      // 409 SECTION_IN_USE lands here — the section still has assignments.
      pushToast('error', err instanceof Error ? err.message : 'Could not delete the section.');
    } finally {
      setDeleting(false);
    }
  }
  return (
    <section aria-labelledby="sections-title" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 id="sections-title" className="text-2xl font-semibold text-primary-dark">
            Sections
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Class sections grouped by year level. Sections with workload assignments cannot be deleted.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="section-year-filter" className="sr-only">
            Filter sections by year level
          </label>
          <select
            id="section-year-filter"
            value={yearFilter === null ? '' : String(yearFilter)}
            onChange={(event) =>
              setYearFilter(event.target.value === '' ? null : Number(event.target.value))
            }
            className="rounded-xl border-[1.5px] border-leaf-100 bg-white/80 px-3 py-2 text-sm text-ink outline-none focus:border-leaf-500"
          >
            <option value="">All years</option>
            {YEAR_OPTIONS.map((year) => (
              <option key={year} value={year}>
                Year {year}
              </option>
            ))}
          </select>
          <label htmlFor="section-search" className="sr-only">
            Search sections by name
          </label>
          <input
            id="section-search"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by name…"
            className="w-56 rounded-xl border-[1.5px] border-leaf-100 bg-white/80 px-3.5 py-2 text-sm text-ink outline-none focus:border-leaf-500"
          />
          {canEdit ? (
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-leaf-500 px-4 py-2 text-sm font-semibold text-white hover:bg-leaf-600"
            >
              + Add section
            </button>
          ) : null}
        </div>
      </div>

      {status === 'loading' ? (
        <p className="rounded-xl border border-leaf-100 bg-white px-4 py-8 text-center text-sm text-ink/60">
          Loading sections…
        </p>
      ) : status === 'error' ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-red-700">Could not load sections.</p>
          <button
            type="button"
            onClick={() => {
              setStatus('loading');
              void load();
            }}
            className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      ) : sections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-leaf-200 bg-white px-4 py-10 text-center">
          <p className="text-sm font-medium text-ink">
            {search || yearFilter !== null ? 'No sections match your filters.' : 'No sections yet.'}
          </p>
          {canEdit && !search && yearFilter === null ? (
            <button
              type="button"
              onClick={openCreate}
              className="mt-3 rounded-lg bg-leaf-500 px-4 py-2 text-sm font-semibold text-white hover:bg-leaf-600"
            >
              Add the first section
            </button>
          ) : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-leaf-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-leaf-100 bg-leaf-50/60 text-left">
                <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink/60">
                  Section
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink/60">
                  Year level
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink/60">
                  Size (students)
                </th>
                {canEdit ? (
                  <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink/60">
                    Actions
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <tr key={section.id} className="border-b border-leaf-50 last:border-b-0 hover:bg-leaf-50/40">
                  <td className="px-4 py-3">
                    <span className="font-medium text-ink">{section.name}</span>
                    <span className="ml-2 text-xs text-ink/50">{section.label}</span>
                  </td>
                  <td className="px-4 py-3 text-ink/70">Year {section.year_level}</td>
                  <td className="px-4 py-3 text-ink/70">{section.size} students</td>
                  {canEdit ? (
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(section)}
                          className="rounded-lg border border-leaf-100 px-3 py-1.5 text-xs font-medium text-ink/70 hover:border-leaf-300"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingSection(section)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal
        open={modal.mode !== 'closed'}
        title={modal.mode === 'edit' ? 'Edit Section' : 'Add Section'}
        onClose={saving ? () => undefined : closeModal}
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="section-year-level" className="mb-1.5 block text-xs font-semibold text-ink/70">
              Year level
            </label>
            <select
              id="section-year-level"
              value={formValues.year_level}
              onChange={(event) => setField('year_level', event.target.value)}
              aria-invalid={fieldErrors.year_level ? true : undefined}
              className={inputClass}
            >
              <option value="">Select year…</option>
              {YEAR_OPTIONS.map((year) => (
                <option key={year} value={year}>
                  Year {year}
                </option>
              ))}
            </select>
            {fieldErrors.year_level ? (
              <p className="mt-1 text-sm text-red-600">{fieldErrors.year_level}</p>
            ) : null}
          </div>
          <div>
            <label htmlFor="section-name" className="mb-1.5 block text-xs font-semibold text-ink/70">
              Section name
            </label>
            <input
              id="section-name"
              type="text"
              value={formValues.name}
              onChange={(event) => setField('name', event.target.value)}
              placeholder="e.g. 1A"
              aria-invalid={fieldErrors.name ? true : undefined}
              className={inputClass}
            />
            {fieldErrors.name ? <p className="mt-1 text-sm text-red-600">{fieldErrors.name}</p> : null}
          </div>
          <div>
            <label htmlFor="section-size" className="mb-1.5 block text-xs font-semibold text-ink/70">
              Class size (students)
            </label>
            <input
              id="section-size"
              type="number"
              min={1}
              max={500}
              step={1}
              value={formValues.size}
              onChange={(event) => setField('size', event.target.value)}
              placeholder="e.g. 40"
              aria-invalid={fieldErrors.size ? true : undefined}
              className={inputClass}
            />
            {fieldErrors.size ? <p className="mt-1 text-sm text-red-600">{fieldErrors.size}</p> : null}
          </div>
          {formError ? (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              <p>{formError}</p>
            </div>
          ) : null}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeModal}
              disabled={saving}
              className="rounded-lg border border-leaf-100 px-4 py-2 text-sm font-medium text-ink/70 hover:bg-leaf-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-leaf-500 px-4 py-2 text-sm font-semibold text-white hover:bg-leaf-600 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deletingSection !== null}
        title="Delete section"
        message={
          deletingSection
            ? `Delete section "${deletingSection.label}"? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        pending={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => (deleting ? undefined : setDeletingSection(null))}
      />
    </section>
  );
}
