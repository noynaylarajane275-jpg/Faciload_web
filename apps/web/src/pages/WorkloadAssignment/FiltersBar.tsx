import type { FacultyMember } from '../../lib/faculty';
import type { Section } from '../../lib/sections';
import type { Term } from '../../lib/terms';

export function FiltersBar(props: {
  searchInput: string;
  termFilter: string;
  facultyFilter: string;
  sectionFilter: string;
  terms: Term[];
  faculties: FacultyMember[];
  sections: Section[];
  onSearch: (value: string) => void;
  onTerm: (value: string) => void;
  onFaculty: (value: string) => void;
  onSection: (value: string) => void;
}): JSX.Element {
  const selectClass =
    'w-full rounded-xl border-[1.5px] border-leaf-100 bg-white/80 px-3 py-2.5 text-sm text-ink outline-none focus:border-leaf-500';
  return (
    <div className="mb-4 grid gap-3 rounded-2xl border border-leaf-100 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-ink/70">Search</span>
        <input
          type="search"
          aria-label="Search assignments"
          placeholder="Faculty, subject, section…"
          value={props.searchInput}
          onChange={(event) => props.onSearch(event.target.value)}
          className="w-full rounded-xl border-[1.5px] border-leaf-100 bg-white/80 px-3.5 py-2.5 text-sm text-ink outline-none focus:border-leaf-500"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-ink/70">Term</span>
        <select aria-label="Filter by term" value={props.termFilter} onChange={(e) => props.onTerm(e.target.value)} className={selectClass}>
          <option value="">All terms</option>
          {props.terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.label}
              {term.is_active ? ' (active)' : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-ink/70">Faculty</span>
        <select aria-label="Filter by faculty" value={props.facultyFilter} onChange={(e) => props.onFaculty(e.target.value)} className={selectClass}>
          <option value="">All faculty</option>
          {props.faculties.map((f) => (
            <option key={f.id} value={f.id}>
              {f.first_name} {f.last_name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-ink/70">Section</span>
        <select aria-label="Filter by section" value={props.sectionFilter} onChange={(e) => props.onSection(e.target.value)} className={selectClass}>
          <option value="">All sections</option>
          {props.sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
