import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildScheduleWorkbook,
  downloadWorkbook,
  exportFileName,
  loadSchoolLogo,
} from '../lib/schedule-export';
import { DAY_END_HOUR, DAY_START_HOUR, DAYS } from './Schedule/schedule-time';
import { listFaculty, type FacultyMember } from '../lib/faculty';
import { listSections, type Section } from '../lib/sections';
import { listWorkloadAssignments, type WorkloadAssignment } from '../lib/workload-assignments';
import { getFacultySchedule, getSectionSchedule } from '../lib/schedule-views';
import { getDashboardSummary, type DepartmentSummary } from '../lib/dashboard';
import { aggregateWorkload, viewSlotToExportSlot, workloadToCsv } from '../lib/reports';
import { selectSelectedTerm, useTermStore } from '../store/term.store';
import { useToast } from '../components/Toast';
import { NoScheduleEmptyState, TermPicker, ViewErrorState, ViewLoadingState } from './Views/views-common';
import { StatCard, WorkloadTable } from './ReportsTable';
import { UtilizationPanel } from './ReportsUtilization';
import { ExportsPanel } from './ReportsExports';

type LoadStatus = 'loading' | 'ready' | 'error';

const selectCls =
  'rounded-lg border border-leaf-100 bg-white px-2 py-1.5 text-xs text-ink outline-none transition-colors focus:border-leaf-500 focus:ring-4 focus:ring-leaf-500/15';

/**
 * Reports — workload summaries + schedule exports (ui-ux.md §4, FR-07).
 * Chair + Academic Admin only (route-guarded). Frontend-only: aggregates the
 * existing workload-assignment list + department dashboard summary, and reuses
 * the Schedule page's Excel exporter for per-faculty / per-section programs.
 */
export function ReportsPage(): JSX.Element {
  const { pushToast } = useToast();
  const termStatus = useTermStore((s) => s.status);
  const loadTerms = useTermStore((s) => s.loadTerms);
  const selectedTermId = useTermStore((s) => s.selectedTermId);
  const term = useTermStore(selectSelectedTerm);

  useEffect(() => {
    if (termStatus === 'idle') {
      void loadTerms();
    }
  }, [termStatus, loadTerms]);

  const [assignments, setAssignments] = useState<WorkloadAssignment[]>([]);
  const [summary, setSummary] = useState<DepartmentSummary | null>(null);
  const [faculties, setFaculties] = useState<FacultyMember[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [reloadTick, setReloadTick] = useState(0);
  const [facultyFilter, setFacultyFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [search, setSearch] = useState('');
  const [exportFacultyId, setExportFacultyId] = useState('');
  const [exportSectionId, setExportSectionId] = useState('');
  const [exporting, setExporting] = useState<'faculty' | 'section' | 'csv' | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [assignmentRes, summaryRes, facultyRes, sectionRes] = await Promise.all([
        listWorkloadAssignments({ termId: selectedTermId ?? undefined, pageSize: 200 }),
        getDashboardSummary(selectedTermId ?? undefined),
        listFaculty({ pageSize: 100 }),
        listSections(),
      ]);
      setAssignments(assignmentRes.data);
      setSummary(summaryRes.summary.scope === 'department' ? summaryRes.summary : null);
      setFaculties(facultyRes.data);
      setSections(sectionRes.data);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [selectedTermId]);

  useEffect(() => {
    if (termStatus === 'ready') {
      void load();
    }
  }, [termStatus, load, reloadTick]);

  const facultyById = useMemo(
    () =>
      new Map(
        faculties.map((member) => [
          member.id,
          { employee_no: member.employee_no, max_units: member.max_units },
        ]),
      ),
    [faculties],
  );

  const workloadRows = useMemo(
    () => aggregateWorkload(assignments, facultyById),
    [assignments, facultyById],
  );

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return workloadRows.filter((row) => {
      if (facultyFilter && row.faculty_id !== facultyFilter) return false;
      if (query) {
        const hay = `${row.faculty_name} ${row.employee_no}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      if (sectionFilter) {
        const hit = assignments.some(
          (a) => a.faculty_id === row.faculty_id && a.section_id === sectionFilter,
        );
        if (!hit) return false;
      }
      return true;
    });
  }, [workloadRows, facultyFilter, sectionFilter, search, assignments]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => ({
        faculty: acc.faculty + 1,
        subjects: acc.subjects + row.subjects,
        weekly: Math.round((acc.weekly + row.weekly_hours) * 100) / 100,
        scheduled: Math.round((acc.scheduled + row.scheduled_hours) * 100) / 100,
        remaining: Math.round((acc.remaining + row.remaining_hours) * 100) / 100,
      }),
      { faculty: 0, subjects: 0, weekly: 0, scheduled: 0, remaining: 0 },
    );
  }, [filteredRows]);

  const utilization = summary?.room_utilization ?? null;
  const mostBooked = summary?.most_booked_rooms ?? [];
  const unscheduled = summary?.unscheduled_assignments_count ?? 0;

  async function handleExportFaculty(): Promise<void> {
    if (!exportFacultyId || exporting) return;
    setExporting('faculty');
    try {
      const view = await getFacultySchedule(exportFacultyId, selectedTermId ?? undefined);
      if (view.data.length === 0) {
        pushToast('info', 'No classes scheduled for this faculty member yet.');
        return;
      }
      const logo = await loadSchoolLogo();
      const buffer = await buildScheduleWorkbook({
        header: {
          title: 'FACULTY CLASS PROGRAM',
          subtitle: term?.label ?? 'Active term',
          institution: ['Republic of the Philippines', 'Palompon Institute of Technology', 'Palompon, Leyte'],
          college: 'College of Technology and Engineering',
          room: '—',
          program: view.faculty.name,
          major: view.faculty.employee_no,
          yearSection: '',
        },
        slots: view.data.map((row, index) =>
          viewSlotToExportSlot(row, index, { facultyId: view.faculty.id, sectionId: '', termId: selectedTermId ?? '' }),
        ),
        days: DAYS,
        startHour: DAY_START_HOUR,
        endHour: DAY_END_HOUR,
        colorFor: (slot) => slot.color,
        logo,
      });
      downloadWorkbook(buffer, `${exportFileName('Faculty Class Program', view.faculty.name, term?.label)}.xlsx`);
      pushToast('success', 'Faculty class program downloaded.');
    } catch {
      pushToast('error', 'Could not build the Excel file.');
    } finally {
      setExporting(null);
    }
  }

  async function handleExportSection(): Promise<void> {
    if (!exportSectionId || exporting) return;
    setExporting('section');
    try {
      const view = await getSectionSchedule(exportSectionId, selectedTermId ?? undefined);
      if (view.data.length === 0) {
        pushToast('info', 'No classes scheduled for this section yet.');
        return;
      }
      const logo = await loadSchoolLogo();
      const buffer = await buildScheduleWorkbook({
        header: {
          title: 'STUDENT CLASS PROGRAM',
          subtitle: term?.label ?? 'Active term',
          institution: ['Republic of the Philippines', 'Palompon Institute of Technology', 'Palompon, Leyte'],
          college: 'College of Technology and Engineering',
          room: '—',
          program: view.section.label,
          major: '',
          yearSection: view.section.label,
        },
        slots: view.data.map((row, index) =>
          viewSlotToExportSlot(row, index, { facultyId: '', sectionId: view.section.id, termId: selectedTermId ?? '' }),
        ),
        days: DAYS,
        startHour: DAY_START_HOUR,
        endHour: DAY_END_HOUR,
        colorFor: (slot) => slot.color,
        logo,
      });
      downloadWorkbook(buffer, `${exportFileName('Student Class Program', view.section.label, term?.label)}.xlsx`);
      pushToast('success', 'Section class program downloaded.');
    } catch {
      pushToast('error', 'Could not build the Excel file.');
    } finally {
      setExporting(null);
    }
  }

  function handleExportCsv(): void {
    if (exporting || filteredRows.length === 0) return;
    setExporting('csv');
    try {
      const blob = new Blob([workloadToCsv(filteredRows)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${exportFileName('Workload Summary', term?.label) || 'workload-summary'}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      pushToast('success', 'Workload summary downloaded.');
    } catch {
      pushToast('error', 'Could not build the CSV file.');
    } finally {
      setExporting(null);
    }
  }

  return (
    <section aria-labelledby="reports-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="reports-title" className="text-2xl font-semibold text-primary-dark">
            Reports
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Workload summaries and schedule exports for {term ? term.label : '…'}.
          </p>
        </div>
        <TermPicker />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-ink/60">
          Faculty
          <select aria-label="Filter reports by faculty" value={facultyFilter} onChange={(e) => setFacultyFilter(e.target.value)} className={selectCls}>
            <option value="">All</option>
            {faculties.map((m) => (
              <option key={m.id} value={m.id}>{m.last_name}, {m.first_name}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink/60">
          Section
          <select aria-label="Filter reports by section" value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} className={selectCls}>
            <option value="">All</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink/60">
          Search
          <input aria-label="Search workload by faculty" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or employee no…" className={selectCls} />
        </label>
      </div>
      {status === 'loading' ? (
        <ViewLoadingState />
      ) : status === 'error' ? (
        <ViewErrorState onRetry={() => setReloadTick((t) => t + 1)} />
      ) : filteredRows.length === 0 ? (
        <NoScheduleEmptyState />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Faculty" value={String(totals.faculty)} />
            <StatCard label="Subjects" value={String(totals.subjects)} />
            <StatCard label="Weekly hours" value={`${totals.weekly}h`} />
            <StatCard label="Scheduled" value={`${totals.scheduled}h`} />
            <StatCard label="Remaining" value={`${totals.remaining}h`} />
          </div>
          <WorkloadTable rows={filteredRows} />
          <UtilizationPanel utilization={utilization} unscheduled={unscheduled} mostBooked={mostBooked} />
          <ExportsPanel
            faculties={faculties}
            sections={sections}
            exportFacultyId={exportFacultyId}
            exportSectionId={exportSectionId}
            exporting={exporting}
            hasRows={filteredRows.length > 0}
            onExportFacultyId={setExportFacultyId}
            onExportSectionId={setExportSectionId}
            onExportFaculty={() => void handleExportFaculty()}
            onExportSection={() => void handleExportSection()}
            onExportCsv={handleExportCsv}
          />
        </div>
      )}
    </section>
  );
}
