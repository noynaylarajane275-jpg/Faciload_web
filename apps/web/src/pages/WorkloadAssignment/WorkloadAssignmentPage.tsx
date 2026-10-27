import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import {
  createWorkloadAssignment,
  deleteWorkloadAssignment,
  listWorkloadAssignments,
  updateWorkloadAssignment,
  type WorkloadAssignment,
  type WorkloadAssignmentListResult,
} from '../../lib/workload-assignments';
import { listFaculty, type FacultyMember } from '../../lib/faculty';
import { listSections, type Section } from '../../lib/sections';
import { listSubjects, type Subject } from '../../lib/subjects';
import { useAuthStore } from '../../store/auth.store';
import { isManagementRole } from '../../config/navigation';
import { useTermStore } from '../../store/term.store';
import { AssignmentsTable } from './AssignmentsTable';
import { AssignmentForm } from './AssignmentForm';
import { FiltersBar } from './FiltersBar';
import { createSchema, editSchema, EMPTY_FORM, PAGE_SIZE, SEARCH_DEBOUNCE_MS, type FormField, type FormValues, type ModalState } from './types';

export function WorkloadAssignmentPage(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const { pushToast } = useToast();
  const canEdit = isManagementRole(user?.role);

  const terms = useTermStore((s) => s.terms);
  const selectedTermId = useTermStore((s) => s.selectedTermId);
  const loadTerms = useTermStore((s) => s.loadTerms);

  const [result, setResult] = useState<WorkloadAssignmentListResult | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');

  const [termFilter, setTermFilter] = useState('');
  const [facultyFilter, setFacultyFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [faculties, setFaculties] = useState<FacultyMember[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sections, setSections] = useState<Section[]>([]);

  const [modal, setModal] = useState<ModalState>({ mode: 'closed', assignment: null });
  const [formValues, setFormValues] = useState<FormValues>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FormField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<WorkloadAssignment | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingPending, setDeletingPending] = useState(false);

  const requestIdRef = useRef(0);

  useEffect(() => {
    void loadTerms();
  }, [loadTerms]);

  useEffect(() => {
    if (termFilter === '' && selectedTermId) setTermFilter(selectedTermId);
  }, [selectedTermId, termFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadOptions = useCallback(async () => {
    try {
      const [facultyRes, sectionRes, subjectRes] = await Promise.all([
        listFaculty({ page: 1, pageSize: 100 }),
        listSections(),
        listSubjects({ page: 1, pageSize: 100 }),
      ]);
      setFaculties(facultyRes.data);
      setSections(sectionRes.data);
      setSubjects(subjectRes.data);
    } catch {
      /* dropdowns degrade gracefully */
    }
  }, []);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    try {
      const res = await listWorkloadAssignments({
        termId: termFilter || undefined,
        facultyId: facultyFilter || undefined,
        sectionId: sectionFilter || undefined,
        search: search || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      if (requestIdRef.current !== requestId) return;
      setResult(res);
      setStatus('ready');
    } catch {
      if (requestIdRef.current !== requestId) return;
      setStatus('error');
    }
  }, [termFilter, facultyFilter, sectionFilter, search, page, reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate(): void {
    setFormValues({ faculty_id: '', subject_id: '', section_id: '', term_id: termFilter || selectedTermId || '' });
    setFieldErrors({});
    setFormError(null);
    setModal({ mode: 'create', assignment: null });
  }

  function openEdit(assignment: WorkloadAssignment): void {
    setFormValues({
      faculty_id: assignment.faculty_id,
      subject_id: assignment.subject_id,
      section_id: assignment.section_id,
      term_id: assignment.term_id,
    });
    setFieldErrors({});
    setFormError(null);
    setModal({ mode: 'edit', assignment });
  }

  function closeModal(): void {
    if (saving) return;
    setModal({ mode: 'closed', assignment: null });
  }

  function updateField(field: FormField, value: string): void {
    setFormValues((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSave(event: FormEvent): Promise<void> {
    event.preventDefault();
    const editing = modal.assignment;
    const locked = modal.mode === 'edit';
    const parsed = (locked ? editSchema : createSchema).safeParse(
      locked
        ? { subject_id: formValues.subject_id, section_id: formValues.section_id }
        : formValues,
    );
    if (!parsed.success) {
      const errors: Partial<Record<FormField, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as FormField | undefined;
        if (key && !errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (modal.mode === 'create') {
        await createWorkloadAssignment({
          faculty_id: formValues.faculty_id,
          subject_id: formValues.subject_id,
          section_id: formValues.section_id,
          term_id: formValues.term_id,
        });
        pushToast('success', 'Assignment created.');
      } else if (editing) {
        await updateWorkloadAssignment(editing.id, {
          subject_id: formValues.subject_id,
          section_id: formValues.section_id,
        });
        pushToast('success', 'Assignment saved.');
      }
      setModal({ mode: 'closed', assignment: null });
      setReloadKey((key) => key + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the assignment.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deleting) return;
    setDeletingPending(true);
    setDeleteError(null);
    try {
      await deleteWorkloadAssignment(deleting.id);
      pushToast('success', 'Assignment deleted.');
      setDeleting(null);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete the assignment.');
    } finally {
      setDeletingPending(false);
    }
  }

  const meta = result?.meta ?? null;
  const rows = result?.data ?? [];
  return (
    <section aria-label="Workload Assignment">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-primary-dark">Workload Assignment</h2>
          <p className="mt-1 text-sm text-slate-600">Faculty + Subject + Section links for the active term.</p>
        </div>
        {canEdit ? (
          <button type="button" onClick={openCreate} className="rounded-xl bg-leaf-600 px-4 py-2 text-sm font-semibold text-white hover:bg-leaf-700">
            + New Assignment
          </button>
        ) : null}
      </div>
      <FiltersBar
        searchInput={searchInput}
        termFilter={termFilter}
        facultyFilter={facultyFilter}
        sectionFilter={sectionFilter}
        terms={terms}
        faculties={faculties}
        sections={sections}
        onSearch={setSearchInput}
        onTerm={(v) => { setTermFilter(v); setPage(1); }}
        onFaculty={(v) => { setFacultyFilter(v); setPage(1); }}
        onSection={(v) => { setSectionFilter(v); setPage(1); }}
      />
      {status === 'loading' ? (
        <div className="space-y-2" role="status" aria-label="Loading assignments">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-14 animate-pulse rounded-xl bg-leaf-50" />
          ))}
        </div>
      ) : status === 'error' ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center" role="alert">
          <p className="text-sm font-medium text-red-800">Couldn&apos;t load assignments.</p>
          <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white">
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-leaf-200 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-ink">No assignments yet</p>
          <p className="mt-1 text-sm text-slate-600">Nothing assigned for these filters yet.</p>
          {canEdit ? (
            <button type="button" onClick={openCreate} className="mt-4 rounded-xl bg-leaf-600 px-4 py-2 text-sm font-semibold text-white">
              + New Assignment
            </button>
          ) : null}
        </div>
      ) : (
        <AssignmentsTable
          rows={rows}
          meta={meta}
          page={page}
          canEdit={canEdit}
          onPage={setPage}
          onEdit={openEdit}
          onDelete={(assignment) => { setDeleting(assignment); setDeleteError(null); }}
        />
      )}
      <Modal open={modal.mode !== 'closed'} title={modal.mode === 'edit' ? 'Edit Assignment' : 'New Assignment'} onClose={closeModal}>
        <AssignmentForm
          mode={modal.mode}
          values={formValues}
          errors={fieldErrors}
          serverError={formError}
          saving={saving}
          faculties={faculties}
          subjects={subjects}
          sections={sections}
          terms={terms}
          onField={updateField}
          onCancel={closeModal}
          onSubmit={handleSave}
        />
      </Modal>
      <Modal open={deleting !== null} title={deleting ? `Delete assignment — ${deleting.faculty_name}` : 'Delete assignment'} onClose={() => { if (!deletingPending) setDeleting(null); }}>
        <p className="text-sm text-slate-700">
          Remove {deleting ? <strong>{deleting.subject_code}</strong> : 'this assignment'} for {deleting?.faculty_name} ({deleting?.section_label})?
        </p>
        {deleteError ? (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{deleteError}</p>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={() => setDeleting(null)} disabled={deletingPending} className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700">
            Cancel
          </button>
          <button type="button" onClick={() => void handleDelete()} disabled={deletingPending} className="rounded-xl bg-red-600 px-5 py-2 text-sm font-semibold text-white">
            {deletingPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </Modal>
    </section>
  );
}
