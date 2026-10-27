import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { OfficialHeader } from '../components/classprogram/OfficialHeader';
import {
  ClassProgramTimetable,
  type ClassProgramSlot,
} from '../components/classprogram/ClassProgramTimetable';
import { WorkloadSummary } from '../components/classprogram/WorkloadSummary';
import { Modal } from '../components/Modal';
import { listFaculty, type FacultyMember } from '../lib/faculty';
import { listScheduleSlots, type ScheduleSlot } from '../lib/schedule-slots';
import { exportClassProgram } from '../lib/class-program-export';
import {
  createOtherFunctionSession,
  deleteOtherFunctionSession,
  listOtherFunctionSessions,
  type OtherFunctionSession,
  type OtherFunctionType,
} from '../lib/other-function-sessions';
import {
  listWorkloadAssignments,
  type WorkloadAssignment,
} from '../lib/workload-assignments';
import {
  createDesignationSession,
  createFacultyDesignation,
  deleteDesignationSession,
  deleteFacultyDesignation,
  listFacultyDesignations,
  type FacultyDesignation,
} from '../lib/faculty-designations';
import { selectSelectedTerm, useTermStore } from '../store/term.store';
import { useAuthStore } from '../store/auth.store';
import { isManagementRole } from '../config/navigation';
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
  const [otherFunctionSessions, setOtherFunctionSessions] = useState<OtherFunctionSession[]>([]);
  const [designations, setDesignations] = useState<FacultyDesignation[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadTick, setReloadTick] = useState(0);
  const [addOtherFunctionOpen, setAddOtherFunctionOpen] = useState(false);
  const [savingOtherFunction, setSavingOtherFunction] = useState(false);
  const [otherFunctionType, setOtherFunctionType] = useState<OtherFunctionType>('RESEARCH');
  const [otherFunctionDay, setOtherFunctionDay] =
    useState<OtherFunctionSession['day_of_week']>('MON');
  const [otherFunctionStart, setOtherFunctionStart] = useState('08:00');
  const [otherFunctionEnd, setOtherFunctionEnd] = useState('09:00');
  const [addDesignationOpen, setAddDesignationOpen] = useState(false);
  const [savingDesignation, setSavingDesignation] = useState(false);
  const [designationName, setDesignationName] = useState('');
  const [addDesignationSessionOpen, setAddDesignationSessionOpen] = useState(false);
  const [savingDesignationSession, setSavingDesignationSession] = useState(false);
  const [designationSessionId, setDesignationSessionId] = useState('');
  const [designationSessionDay, setDesignationSessionDay] =
    useState<OtherFunctionSession['day_of_week']>('MON');
  const [designationSessionStart, setDesignationSessionStart] = useState('08:00');
  const [designationSessionEnd, setDesignationSessionEnd] = useState('09:00');

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
      const assignments: WorkloadAssignment[] = [];
      if (selectedTermId) {
        let page = 1;
        for (;;) {
          const res = await listWorkloadAssignments({
            termId: selectedTermId,
            facultyId: displayFacultyId || undefined,
            page,
            pageSize: 100,
          });
          assignments.push(...res.data);
          if (page >= res.meta.pageCount) break;
          page += 1;
        }
      }
      const workloadAssignments = assignments.map((assignment) => ({
        subjectCode: assignment.subject_code,
        subjectTitle: assignment.subject_title,
        sectionLabel: assignment.section_label,
        facultyName: assignment.faculty_name,
        lectureHrs: assignment.lecture_hours,
        labHrs: assignment.lab_hours,
      }));
      const totalLectureHrs = workloadAssignments.reduce(
        (sum, assignment) => sum + assignment.lectureHrs,
        0,
      );
      const totalLabHrs = workloadAssignments.reduce(
        (sum, assignment) => sum + assignment.labHrs,
        0,
      );
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
        otherFunctionSessions: otherFunctionSessions.map((session) => ({
          functionType: session.function_type,
          title: session.title,
          day_of_week: session.day_of_week,
          start_time: session.start_time,
          end_time: session.end_time,
        })),
        designationSessions: designations.flatMap((designation) =>
          designation.sessions.map((session) => ({
            designationName: designation.name,
            title: session.title,
            day_of_week: session.day_of_week,
            start_time: session.start_time,
            end_time: session.end_time,
          })),
        ),
        workload: {
          lectureHrs: totalLectureHrs,
          labHrs: totalLabHrs,
          numPreparations: new Set(
            workloadAssignments.map((assignment) => assignment.subjectCode),
          ).size,
          assignments: workloadAssignments,
          otherFunctionTotals,
          designationTotals: designations.map((designation) => ({
            name: designation.name,
            totalHours: designation.total_hours,
          })),
        },
        sheetName: activeFaculty ? activeFaculty.last_name : 'Master Timetable',
      });
      pushToast('success', 'Excel file downloaded.');
    } catch {
      pushToast('error', 'Could not load class program data or build the Excel file.');
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
        setOtherFunctionSessions([]);
        setDesignations([]);
        setStatus('ready');
      }
      return;
    }
    setStatus('loading');
    try {
      const [res, otherFunctions, facultyDesignations] = await Promise.all([
        listScheduleSlots({
          termId: selectedTermId,
          facultyId: displayFacultyId || undefined,
        }),
        displayFacultyId
          ? listOtherFunctionSessions(selectedTermId, displayFacultyId)
          : Promise.resolve([]),
        displayFacultyId
          ? listFacultyDesignations(selectedTermId, displayFacultyId)
          : Promise.resolve([]),
      ]);
      setSlots(res.data);
      setOtherFunctionSessions(otherFunctions);
      setDesignations(facultyDesignations);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [selectedTermId, termStatus, displayFacultyId]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots, reloadTick]);

  const classProgramSlots = useMemo(
    (): ClassProgramSlot[] => [
      ...slots.map((s) => ({
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
      ...otherFunctionSessions.map((session) => ({
        day_of_week: session.day_of_week,
        start_time: session.start_time,
        end_time: session.end_time,
        subject_code: session.function_type,
        subject_title: session.title,
        faculty_name: '',
        room_name: null,
        color: null,
        otherFunctionType: session.function_type,
        otherFunctionSessionId: session.id,
      })),
      ...designations.flatMap((designation) =>
        designation.sessions.map((session) => ({
          day_of_week: session.day_of_week,
          start_time: session.start_time,
          end_time: session.end_time,
          subject_code: designation.name,
          subject_title: session.title,
          faculty_name: '',
          room_name: null,
          color: null,
          designationName: designation.name,
          designationSessionId: session.id,
        })),
      ),
    ],
    [slots, otherFunctionSessions, designations],
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

  const otherFunctionTotals = useMemo(() => {
    const totals: Record<OtherFunctionType, number> = {
      RESEARCH: 0,
      EXTENSION: 0,
      IMP: 0,
      CONSULTATION: 0,
    };
    for (const session of otherFunctionSessions) {
      totals[session.function_type] +=
        (timeToMinutes(session.end_time) - timeToMinutes(session.start_time)) / 60;
    }
    for (const type of Object.keys(totals) as OtherFunctionType[]) {
      totals[type] = Math.round(totals[type] * 100) / 100;
    }
    return totals;
  }, [otherFunctionSessions]);

  const designationTotals = useMemo(
    () => designations.map((designation) => ({
      id: designation.id,
      name: designation.name,
      totalHours: designation.total_hours,
    })),
    [designations],
  );

  const handleAddOtherFunction = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!selectedTermId || !forcedFacultyId) {
      pushToast('error', 'A faculty account and selected term are required.');
      return;
    }
    if (timeToMinutes(otherFunctionEnd) - timeToMinutes(otherFunctionStart) < 60) {
      pushToast('error', 'A session must be at least one hour.');
      return;
    }
    setSavingOtherFunction(true);
    try {
      await createOtherFunctionSession({
        term_id: selectedTermId,
        function_type: otherFunctionType,
        day_of_week: otherFunctionDay,
        start_time: otherFunctionStart,
        end_time: otherFunctionEnd,
      });
      setAddOtherFunctionOpen(false);
      await loadSlots();
      pushToast('success', 'Other function session added.');
    } catch (error) {
      pushToast(
        'error',
        error instanceof Error ? error.message : 'Could not add the other function session.',
      );
    } finally {
      setSavingOtherFunction(false);
    }
  };

  const handleDeleteOtherFunction = async (sessionId: string): Promise<void> => {
    try {
      await deleteOtherFunctionSession(sessionId);
      await loadSlots();
      pushToast('success', 'Other function session removed.');
    } catch (error) {
      pushToast(
        'error',
        error instanceof Error ? error.message : 'Could not remove the other function session.',
      );
    }
  };

  const handleAddDesignation = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!displayFacultyId || !selectedTermId) {
      pushToast('error', 'Select an instructor and term first.');
      return;
    }
    setSavingDesignation(true);
    try {
      await createFacultyDesignation({
        faculty_id: displayFacultyId,
        term_id: selectedTermId,
        name: designationName,
      });
      setDesignationName('');
      await loadSlots();
      pushToast('success', 'Designation assigned to the instructor.');
    } catch (error) {
      pushToast(
        'error',
        error instanceof Error ? error.message : 'Could not assign the designation.',
      );
    } finally {
      setSavingDesignation(false);
    }
  };

  const handleDeleteDesignation = async (id: string): Promise<void> => {
    try {
      await deleteFacultyDesignation(id);
      await loadSlots();
      pushToast('success', 'Designation removed.');
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Could not remove designation.');
    }
  };

  const handleAddDesignationSession = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!designationSessionId) {
      pushToast('error', 'Choose one of your assigned designations.');
      return;
    }
    setSavingDesignationSession(true);
    try {
      await createDesignationSession({
        designation_id: designationSessionId,
        day_of_week: designationSessionDay,
        start_time: designationSessionStart,
        end_time: designationSessionEnd,
      });
      setAddDesignationSessionOpen(false);
      await loadSlots();
      pushToast('success', 'Designation session added.');
    } catch (error) {
      pushToast(
        'error',
        error instanceof Error ? error.message : 'Could not add designation session.',
      );
    } finally {
      setSavingDesignationSession(false);
    }
  };

  const handleDeleteDesignationSession = async (id: string): Promise<void> => {
    try {
      await deleteDesignationSession(id);
      await loadSlots();
      pushToast('success', 'Designation session removed.');
    } catch (error) {
      pushToast(
        'error',
        error instanceof Error ? error.message : 'Could not remove designation session.',
      );
    }
  };

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
            disabled={status !== 'ready'}
            className="rounded-lg bg-primary-dark px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary"
          >
            Print / PDF
          </button>
          {user?.role === 'FACULTY' && (
            <button
              type="button"
              onClick={() => setAddOtherFunctionOpen(true)}
              disabled={status !== 'ready' || !selectedTermId}
              className="rounded-lg border border-leaf-100 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-leaf-500 disabled:opacity-60"
            >
              Add Other Functions
            </button>
          )}
          {isManagementRole(user?.role) && displayFacultyId && (
            <button
              type="button"
              onClick={() => setAddDesignationOpen(true)}
              disabled={status !== 'ready' || !selectedTermId}
              className="rounded-lg border border-leaf-100 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-leaf-500 disabled:opacity-60"
            >
              Add Designation
            </button>
          )}
          {user?.role === 'FACULTY' && designations.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setDesignationSessionId(designations[0]?.id ?? '');
                setAddDesignationSessionOpen(true);
              }}
              disabled={status !== 'ready' || !selectedTermId}
              className="rounded-lg border border-leaf-100 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-leaf-500 disabled:opacity-60"
            >
              Add Designation Session
            </button>
          )}
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
              onDeleteOtherFunction={
                user?.role === 'FACULTY' ? (id) => void handleDeleteOtherFunction(id) : undefined
              }
              onDeleteDesignationSession={
                user?.role === 'FACULTY'
                  ? (id) => void handleDeleteDesignationSession(id)
                  : undefined
              }
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
                otherFunctionTotals={otherFunctionTotals}
                designations={designationTotals}
              />
            </div>
          )}
        </div>
      )}
      <Modal
        open={addOtherFunctionOpen}
        title="Add Other Function"
        onClose={() => {
          if (!savingOtherFunction) setAddOtherFunctionOpen(false);
        }}
      >
        <form className="space-y-4" onSubmit={(event) => void handleAddOtherFunction(event)}>
          <label className="block text-sm font-medium text-slate-700">
            Function type
            <select
              value={otherFunctionType}
              onChange={(event) => setOtherFunctionType(event.target.value as OtherFunctionType)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="RESEARCH">Research</option>
              <option value="EXTENSION">Extension</option>
              <option value="IMP">IMP</option>
              <option value="CONSULTATION">Consultation</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Weekday
            <select
              value={otherFunctionDay}
              onChange={(event) =>
                setOtherFunctionDay(event.target.value as OtherFunctionSession['day_of_week'])
              }
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="MON">Monday</option>
              <option value="TUE">Tuesday</option>
              <option value="WED">Wednesday</option>
              <option value="THU">Thursday</option>
              <option value="FRI">Friday</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-slate-700">
              Start time
              <input
                type="time"
                required
                min="07:00"
                max="19:00"
                step={1800}
                value={otherFunctionStart}
                onChange={(event) => setOtherFunctionStart(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              End time
              <input
                type="time"
                required
                min="07:00"
                max="19:00"
                step={1800}
                value={otherFunctionEnd}
                onChange={(event) => setOtherFunctionEnd(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              />
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Sessions must last at least one hour, fit between 7:00 AM and 7:00 PM,
            and cannot overlap lunch, classes, or another other-function session.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAddOtherFunctionOpen(false)}
              disabled={savingOtherFunction}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingOtherFunction}
              className="rounded-lg bg-primary-dark px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {savingOtherFunction ? 'Saving…' : 'Add Session'}
            </button>
          </div>
        </form>
      </Modal>
      <Modal
        open={addDesignationOpen}
        title="Add Designation"
        onClose={() => {
          if (!savingDesignation) setAddDesignationOpen(false);
        }}
      >
        <form className="space-y-4" onSubmit={(event) => void handleAddDesignation(event)}>
          <label className="block text-sm font-medium text-slate-700">
            Designation name
            <input
              required
              maxLength={120}
              value={designationName}
              onChange={(event) => setDesignationName(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              placeholder="e.g. Program Coordinator"
            />
          </label>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">Assigned designations</h2>
            {designations.length === 0 ? (
              <p className="text-sm text-slate-500">No designations assigned for this term.</p>
            ) : (
              <ul className="space-y-1">
                {designations.map((designation) => (
                  <li
                    key={designation.id}
                    className="flex items-center justify-between gap-2 text-sm text-slate-700"
                  >
                    <span>{designation.name}</span>
                    <button
                      type="button"
                      onClick={() => void handleDeleteDesignation(designation.id)}
                      className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAddDesignationOpen(false)}
              disabled={savingDesignation}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={savingDesignation}
              className="rounded-lg bg-primary-dark px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {savingDesignation ? 'Saving…' : 'Assign Designation'}
            </button>
          </div>
        </form>
      </Modal>
      <Modal
        open={addDesignationSessionOpen}
        title="Add Designation Session"
        onClose={() => {
          if (!savingDesignationSession) setAddDesignationSessionOpen(false);
        }}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => void handleAddDesignationSession(event)}
        >
          <label className="block text-sm font-medium text-slate-700">
            Designation
            <select
              required
              value={designationSessionId}
              onChange={(event) => setDesignationSessionId(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              {designations.map((designation) => (
                <option key={designation.id} value={designation.id}>{designation.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Weekday
            <select
              value={designationSessionDay}
              onChange={(event) =>
                setDesignationSessionDay(event.target.value as OtherFunctionSession['day_of_week'])
              }
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="MON">Monday</option>
              <option value="TUE">Tuesday</option>
              <option value="WED">Wednesday</option>
              <option value="THU">Thursday</option>
              <option value="FRI">Friday</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-slate-700">
              Start time
              <input
                type="time"
                required
                min="07:00"
                max="19:00"
                step={1800}
                value={designationSessionStart}
                onChange={(event) => setDesignationSessionStart(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              End time
              <input
                type="time"
                required
                min="07:00"
                max="19:00"
                step={1800}
                value={designationSessionEnd}
                onChange={(event) => setDesignationSessionEnd(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              />
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Sessions must fit between 7:00 AM and 7:00 PM, avoid lunch, and cannot overlap
            classes or another session.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAddDesignationSessionOpen(false)}
              disabled={savingDesignationSession}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingDesignationSession || designations.length === 0}
              className="rounded-lg bg-primary-dark px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {savingDesignationSession ? 'Saving…' : 'Add Session'}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}