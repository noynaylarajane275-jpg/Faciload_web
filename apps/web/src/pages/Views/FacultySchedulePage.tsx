import { useCallback, useEffect, useState } from 'react';
import { listFaculty, type FacultyMember } from '../../lib/faculty';
import { getFacultySchedule, type FacultyScheduleView } from '../../lib/schedule-views';
import { useAuthStore } from '../../store/auth.store';
import { selectSelectedTerm, useTermStore } from '../../store/term.store';
import { WeeklyScheduleGrid } from './WeeklyScheduleGrid';
import { NoScheduleEmptyState, TermPicker, ViewErrorState, ViewLoadingState } from './views-common';

const selectCls =
  'rounded-lg border border-leaf-100 bg-white px-2 py-1.5 text-xs text-ink outline-none transition-colors focus:border-leaf-500 focus:ring-4 focus:ring-leaf-500/15';

/**
 * "Faculty Class Program" — the auto-generated weekly grid for one instructor
 * across all their sections, straight from the master schedule. A FACULTY-role
 * account is always scoped to itself (the API enforces the same rule with a
 * 403); Chairs / Academic Admins pick any faculty member. Also powers the
 * "My Workload" page via the `selfScoped` prop.
 */
export function FacultySchedulePage({
  selfScoped = false,
  heading = 'Faculty Schedule',
}: {
  selfScoped?: boolean;
  heading?: string;
}): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const lockToSelf = selfScoped || user?.role === 'FACULTY';
  const selfFacultyId = user?.facultyId ?? null;

  // Term (shared with the header selector).
  const termStatus = useTermStore((s) => s.status);
  const loadTerms = useTermStore((s) => s.loadTerms);
  const selectedTermId = useTermStore((s) => s.selectedTermId);
  const term = useTermStore(selectSelectedTerm);

  useEffect(() => {
    if (termStatus === 'idle') {
      void loadTerms();
    }
  }, [termStatus, loadTerms]);

  const [faculty, setFaculty] = useState<FacultyMember[]>([]);
  const [facultyId, setFacultyId] = useState('');
  const [view, setView] = useState<FacultyScheduleView | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('ready');
  const [reloadTick, setReloadTick] = useState(0);

  const activeFacultyId = lockToSelf ? selfFacultyId : facultyId;
  const pickedMember = faculty.find((member) => member.id === facultyId) ?? null;
  const activeFacultyName = lockToSelf
    ? (view?.faculty.name ?? null)
    : pickedMember
      ? `${pickedMember.last_name}, ${pickedMember.first_name}`
      : null;

  // Reference list for the faculty picker (management roles only).
  useEffect(() => {
    if (lockToSelf) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await listFaculty({ pageSize: 100 });
        if (!cancelled) {
          setFaculty(res.data);
        }
      } catch {
        // The picker stays empty; the main panel still renders its states.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lockToSelf]);

  const loadView = useCallback(async () => {
    if (!activeFacultyId) {
      return;
    }
    setStatus('loading');
    try {
      const res = await getFacultySchedule(activeFacultyId, selectedTermId ?? undefined);
      setView(res);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [activeFacultyId, selectedTermId]);

  useEffect(() => {
    void loadView();
  }, [loadView, reloadTick]);

  return (
    <section aria-labelledby="faculty-schedule-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="faculty-schedule-title" className="text-2xl font-semibold text-primary-dark">
            {heading}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Auto-generated Faculty Class Program
            {activeFacultyName ? ` — ${activeFacultyName}` : ''} — every class across the
            instructor's sections, in one grid.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TermPicker />
          {!lockToSelf ? (
            <label className="flex items-center gap-1.5 text-xs text-ink/60">
              Faculty
              <select
                aria-label="Select faculty"
                value={facultyId}
                onChange={(event) => setFacultyId(event.target.value)}
                className={selectCls}
              >
                <option value="">Select…</option>
                {faculty.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.last_name}, {member.first_name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>

      {lockToSelf && !selfFacultyId ? (
        <div className="rounded-xl border border-dashed border-leaf-200 bg-white px-4 py-10 text-center">
          <p className="text-sm font-medium text-ink">
            Your account is not linked to a faculty record yet.
          </p>
          <p className="mt-1 text-sm text-ink/60">
            Ask the department chair to link your login to your faculty profile.
          </p>
        </div>
      ) : !activeFacultyId ? (
        <div className="rounded-xl border border-dashed border-leaf-200 bg-white px-4 py-10 text-center">
          <p className="text-sm font-medium text-ink">
            Pick a faculty member to view their class program.
          </p>
          <p className="mt-1 text-sm text-ink/60">
            The grid fills from the master schedule — nothing to fill in by hand.
          </p>
        </div>
      ) : status === 'error' ? (
        <ViewErrorState onRetry={() => setReloadTick((tick) => tick + 1)} />
      ) : status === 'loading' ? (
        <ViewLoadingState />
      ) : view && view.data.length === 0 ? (
        <NoScheduleEmptyState />
      ) : view ? (
        <div className="space-y-3">
          <p className="text-xs text-ink/60">
            {view.meta.total} {view.meta.total === 1 ? 'class' : 'classes'} ·{' '}
            {term ? term.label : 'all terms'}
          </p>
          <WeeklyScheduleGrid slots={view.data} variant="faculty" />
        </div>
      ) : null}
    </section>
  );
}
