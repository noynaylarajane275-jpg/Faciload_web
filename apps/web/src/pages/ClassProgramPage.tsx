import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { OfficialHeader } from '../components/classprogram/OfficialHeader';
import {
  ClassProgramTimetable,
  type ClassProgramSlot,
} from '../components/classprogram/ClassProgramTimetable';
import { WorkloadSummary } from '../components/classprogram/WorkloadSummary';
import { listFaculty, type FacultyMember } from '../lib/faculty';
import { listScheduleSlots, type ScheduleSlot } from '../lib/schedule-slots';
import { exportClassProgram } from '../lib/class-program-export';
import { selectSelectedTerm, useTermStore } from '../store/term.store';
import { useAuthStore } from '../store/auth.store';
import { ViewLoadingState, ViewErrorState, TermPicker } from './Views/views-common';
import { useToast } from '../components/Toast';

type ViewMode = 'master' | 'faculty';

export function ClassProgramPage(): JSX.Element {
  const { facultyId: routeFacultyId } = useParams();
  const { pushToast } = useToast();
  const user = useAuthStore((s) => s.user);

  // A FACULTY login always sees its own class program, regardless of route.
  const forcedFacultyId = user?.role === 'FACULTY' ? (user.facultyId ?? '') : '';

  const termStatus = useTermStore((s) => s.status);
  const loadTerms = useTermStore((s) => s.loadTerms);
  const selectedTermId = useTermStore((s) => s.selectedTermId);
  const term = useTermStore(selectSelectedTerm);

  const [faculties, setFaculties] = useState<FacultyMember[]>([]);
  const [filterFacultyId, setFilterFacultyId] = useState('');
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadTick, setReloadTick] = useState(0);

  // Whose program is on screen: route param > the logged-in instructor >
  // the master-page filter. Empty = master timetable (every instructor).
  const displayFacultyId = forcedFacultyId || routeFacultyId || filterFacultyId;
  const mode: ViewMode = displayFacultyId ? 'faculty' : 'master';
  const activeFaculty = faculties.find((f) => f.id === displayFacultyId) ?? null;

  const handlePrint = () => {
    window.print();
    pushToast('success', 'Print dialog opened.');
  };

  /**
   * Export the class program as the official "INSTRUCTOR'S CLASS PROGRAM"
   * .xlsx, reproducing the department's printed form sheet-for-sheet.
   *
   * The export mirrors what is on screen: the instructor's own program in
   * faculty mode, every instructor in master mode.
   */
  const [exporting, setExporting] = useState(false);
  const handleExport = async (): Promise<void> => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportClassProgram({
        faculty: activeFaculty
          ? {
              first_name: activeFaculty.first_name,
              last_name: activeFaculty.last_name,
              rank: activeFaculty.rank,
            }
          : null,
        schoolYear: term?.school_year ?? null,
        slots,
        workload: {
          lectureHrs: workload.lectureHrs,
          labHrs: workload.labHrs,
          numPreparations: workload.numPreparations,
        },
        sheetName: activeFaculty ? activeFaculty.last_name : 'Master Timetable',
      });
      pushToast('success', 'Excel file downloaded.');
    } catch {
      pushToast('error', 'Could not build the Excel file.');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (termStatus === 'idle') {
      void loadTerms();
    }
  }, [termStatus, loadTerms]);

  // Faculty list feeds the instructor filter and the header's name/rank.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // The API caps pageSize at 100, so walk the pages until exhausted.
        const all: FacultyMember[] = [];
        let page = 1;
        for (;;) {
          const res = await listFaculty({ page, pageSize: 100 });
          all.push(...res.data);
          if (res.data.length === 0 || page >= res.meta.pageCount) break;
          page += 1;
        }
        if (!cancelled) setFaculties(all);
      } catch {
        // The filter degrades to an empty list; the grid still renders.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSlots = useCallback(async () => {
    if (!selectedTermId) {
      // Terms not resolved yet (or none exist) — show the empty grid once
      // the term store settles instead of spinning forever.
      if (termStatus === 'ready' || termStatus === 'error') {
        setSlots([]);
        setStatus('ready');
      }
      return;
    }
    setStatus('loading');
    try {
      const res = await listScheduleSlots({
        termId: selectedTermId,
        facultyId: displayFacultyId || undefined,
      });
      setSlots(res.data);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [selectedTermId, termStatus, displayFacultyId]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots, reloadTick]);

  const classProgramSlots = useMemo(
    (): ClassProgramSlot[] =>
      slots.map((s) => ({
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        subject_code: s.subject_code,
        subject_title: s.subject_title,
        section_name: s.section_label,
        faculty_name: s.faculty_name,
        room_name: s.room_name,
        color: s.color,
      })),
    [slots],
  );

  // Workload totals from the placed slots — lecture vs lab by session type.
  const workload = useMemo(() => {
    let lectureHrs = 0;
    let labHrs = 0;
    const subjects = new Set<string>();
    for (const slot of slots) {
      const hours =
        (timeToMinutes(slot.end_time) - timeToMinutes(slot.start_time)) / 60;
      if (slot.session_type === 'LAB') {
        labHrs += hours;
      } else {
        lectureHrs += hours;
      }
      subjects.add(slot.subject_code);
    }
    return {
      lectureHrs,
      labHrs,
      totalHrs: lectureHrs + labHrs,
      numPreparations: subjects.size,
    };
  }, [slots]);

  const facultyOptions = faculties.map((f) => ({
    id: f.id,
    label: `${f.last_name}, ${f.first_name}`,
  }));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="no-print">
          <h1 className="text-2xl font-semibold text-primary-dark">
            {mode === 'faculty' ? 'Instructor Class Program' : 'Master Timetable'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {mode === 'faculty'
              ? `Official class program for ${activeFaculty ? activeFaculty.last_name + ', ' + activeFaculty.first_name : ''}`
              : 'Combined class schedule for all instructors, ' + (term ? term.label : 'selected term')}
          </p>
        </div>
        <div className="flex items-center gap-3 no-print">
          <TermPicker />
          {!forcedFacultyId && !routeFacultyId && facultyOptions.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-ink/60">
              Instructor
              <select
                aria-label="Filter by instructor"
                value={displayFacultyId}
                onChange={(event) => setFilterFacultyId(event.target.value)}
                className="rounded-lg border border-leaf-100 bg-white px-2 py-1.5 text-xs text-ink outline-none transition-colors focus:border-leaf-500 focus:ring-4 focus:ring-leaf-500/15"
              >
                <option value="">All instructors</option>
                {facultyOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-lg bg-primary-dark px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary"
          >
            Print / PDF
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            className="rounded-lg border border-leaf-100 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-leaf-500 disabled:opacity-60"
          >
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>
      </div>

      {status === 'loading' ? (
        <ViewLoadingState />
      ) : status === 'error' ? (
        <ViewErrorState onRetry={() => setReloadTick((t) => t + 1)} />
      ) : (
        <div className="class-program-printable">
          <OfficialHeader faculty={activeFaculty} term={term} />

          <div className="mt-4">
            <ClassProgramTimetable
              slots={classProgramSlots}
              variant={mode === 'faculty' ? 'faculty' : 'master'}
              showLunchBreak
            />
          </div>

          {mode === 'faculty' && (
            <div className="mt-4">
              <WorkloadSummary
                faculty={activeFaculty}
                term={term}
                lectureHrs={workload.lectureHrs}
                labHrs={workload.labHrs}
                totalHrs={workload.totalHrs}
                numPreparations={workload.numPreparations}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}