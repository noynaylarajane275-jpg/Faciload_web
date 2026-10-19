import type { FacultyMember } from '../../lib/faculty';
import type { Section } from '../../lib/sections';
import type { Subject } from '../../lib/subjects';
import type { Term } from '../../lib/terms';
import type { FormValues } from './types';

type FormField = keyof FormValues;

export function AssignmentForm(props: {
  mode: 'create' | 'edit' | 'closed';
  values: FormValues;
  errors: Partial<Record<FormField, string>>;
  serverError: string | null;
  saving: boolean;
  faculties: FacultyMember[];
  subjects: Subject[];
  sections: Section[];
  terms: Term[];
  onField: (field: FormField, value: string) => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent) => void;
}): JSX.Element {
  const locked = props.mode === 'edit';
  return (
    <form onSubmit={(event) => props.onSubmit(event)} noValidate className="space-y-4">
      {locked ? (
        <p className="rounded-xl bg-leaf-50 px-3.5 py-2.5 text-xs text-ink/70">
          Faculty and term stay fixed to avoid identity drift — to move this to another faculty member, delete and
          recreate it instead.
        </p>
      ) : null}
      <FormSelect id="wa-faculty" label="Faculty" value={props.values.faculty_id} disabled={locked} error={props.errors.faculty_id} onChange={(v) => props.onField('faculty_id', v)}>
        <option value="">Select faculty…</option>
        {props.faculties.map((f) => (
          <option key={f.id} value={f.id}>
            {f.first_name} {f.last_name} ({f.employee_no})
          </option>
        ))}
      </FormSelect>
      <FormSelect id="wa-subject" label="Subject" value={props.values.subject_id} error={props.errors.subject_id} onChange={(v) => props.onField('subject_id', v)}>
        <option value="">Select subject…</option>
        {props.subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.code} — {s.title}
          </option>
        ))}
      </FormSelect>
      <FormSelect id="wa-section" label="Section" value={props.values.section_id} error={props.errors.section_id} onChange={(v) => props.onField('section_id', v)}>
        <option value="">Select section…</option>
        {props.sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </FormSelect>
      <FormSelect id="wa-term" label="Term" value={props.values.term_id} disabled={locked} error={props.errors.term_id} onChange={(v) => props.onField('term_id', v)}>
        <option value="">Select term…</option>
        {props.terms.map((term) => (
          <option key={term.id} value={term.id}>
            {term.label}
            {term.is_active ? ' (active)' : ''}
          </option>
        ))}
      </FormSelect>
      {props.serverError ? (
        <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {props.serverError}
        </p>
      ) : null}
      <div className="flex justify-end gap-3 pt-1">
        <button
          type="button"
          onClick={props.onCancel}
          disabled={props.saving}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={props.saving}
          className="rounded-xl bg-leaf-600 px-5 py-2 text-sm font-semibold text-white hover:bg-leaf-700 disabled:opacity-50"
        >
          {props.saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

export function FormSelect(props: {
  id: string;
  label: string;
  value: string;
  error?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div>
      <label htmlFor={props.id} className="mb-1.5 block text-xs font-semibold text-ink/70">
        {props.label}
      </label>
      <select
        id={props.id}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        className="w-full rounded-xl border-[1.5px] border-leaf-100 bg-white/80 px-3 py-2.5 text-sm text-ink outline-none focus:border-leaf-500 disabled:opacity-60"
      >
        {props.children}
      </select>
      {props.error ? <p className="mt-1 text-sm text-red-600">{props.error}</p> : null}
    </div>
  );
}
