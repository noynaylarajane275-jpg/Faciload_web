import type { FacultyMember } from '../lib/faculty';
import type { Section } from '../lib/sections';

const selectCls =
  'rounded-lg border border-leaf-100 bg-white px-2 py-1.5 text-xs text-ink outline-none transition-colors focus:border-leaf-500 focus:ring-4 focus:ring-leaf-500/15';

export type ExportKind = 'faculty' | 'section' | 'csv';

export function ExportsPanel(props: {
  faculties: FacultyMember[];
  sections: Section[];
  exportFacultyId: string;
  exportSectionId: string;
  exporting: ExportKind | null;
  hasRows: boolean;
  onExportFacultyId: (id: string) => void;
  onExportSectionId: (id: string) => void;
  onExportFaculty: () => void;
  onExportSection: () => void;
  onExportCsv: () => void;
}): JSX.Element {
  const busy = props.exporting !== null;
  return (
    <div className="rounded-2xl border border-leaf-100 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-ink">Exports</h2>
      <p className="mt-1 text-xs text-ink/60">
        Class programs download as the printed Excel form; the workload summary downloads as CSV.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-1.5 text-xs text-ink/60">
          Faculty program
          <select aria-label="Export faculty program" value={props.exportFacultyId} onChange={(event) => props.onExportFacultyId(event.target.value)} className={selectCls}>
            <option value="">Select…</option>
            {props.faculties.map((member) => (
              <option key={member.id} value={member.id}>{member.last_name}, {member.first_name}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={props.onExportFaculty} disabled={!props.exportFacultyId || busy} className="rounded-lg bg-[#217346] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#185c37] disabled:cursor-not-allowed disabled:opacity-50">
          {props.exporting === 'faculty' ? 'Preparing…' : 'Export faculty .xlsx'}
        </button>
        <label className="flex items-center gap-1.5 text-xs text-ink/60">
          Section program
          <select aria-label="Export section program" value={props.exportSectionId} onChange={(event) => props.onExportSectionId(event.target.value)} className={selectCls}>
            <option value="">Select…</option>
            {props.sections.map((section) => (
              <option key={section.id} value={section.id}>{section.label}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={props.onExportSection} disabled={!props.exportSectionId || busy} className="rounded-lg bg-[#217346] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#185c37] disabled:cursor-not-allowed disabled:opacity-50">
          {props.exporting === 'section' ? 'Preparing…' : 'Export section .xlsx'}
        </button>
        <button type="button" onClick={props.onExportCsv} disabled={!props.hasRows || busy} className="rounded-lg bg-[#217346] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#185c37] disabled:cursor-not-allowed disabled:opacity-50">
          {props.exporting === 'csv' ? 'Preparing…' : 'Export workload .csv'}
        </button>
      </div>
    </div>
  );
}
