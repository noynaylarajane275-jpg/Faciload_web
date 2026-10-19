import { useCallback, useEffect, useState } from 'react';
import {
  getDashboardSummary,
  type DashboardSummary,
} from '../lib/dashboard';
import { useAuthStore } from '../store/auth.store';
import { selectSelectedTerm, useTermStore } from '../store/term.store';
import { DashboardStagger, DashboardStaggerItem } from '../components/dashboard/motion';
import { DashboardHeader } from '../components/dashboard/DashboardHeader';
import { WeeklyPlottingCard } from '../components/dashboard/WeeklyPlottingCard';
import { TermProgressCard } from '../components/dashboard/TermProgressCard';
import { RoomUtilizationCard } from '../components/dashboard/RoomUtilizationCard';
import { FacultyLoadPanel } from '../components/dashboard/FacultyLoadPanel';
import { WeekSchedulePreview } from '../components/dashboard/WeekSchedulePreview';
import { RoomsStatusList } from '../components/dashboard/RoomsStatusList';

type Status = 'loading' | 'ready' | 'error';

export const cardCls = 'glass-card p-4';
export const statValueCls = 'mt-1 font-mono text-3xl font-bold text-slate-900';
export const statLabelCls = 'text-xs font-medium uppercase tracking-wide text-slate-500';
export const sectionTitleCls = 'text-sm font-semibold text-slate-900';
export const sectionSubCls = 'text-xs text-slate-500';

/**
 * Dashboard â€” department overview (ui-ux.md section 4, FR-06/FR-08).
 * Chair / Academic Admin see live department-wide panels; Faculty see only
 * their own summary. All numbers come from GET /api/dashboard/summary.
 */
export function DashboardPage(): JSX.Element {
  // The summary is role-scoped server-side, so it must be re-fetched whenever
  // the signed-in identity changes â€” otherwise a login that swaps users inside
  // one SPA session (chair â†’ faculty) would keep showing the previous user's
  // department-wide payload under the new account.
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const role = useAuthStore((s) => s.user?.role ?? null);
  const termStatus = useTermStore((s) => s.status);
  const loadTerms = useTermStore((s) => s.loadTerms);
  const selectedTermId = useTermStore((s) => s.selectedTermId);
  const term = useTermStore(selectSelectedTerm);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (termStatus === 'idle') {
      void loadTerms();
    }
  }, [termStatus, loadTerms]);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await getDashboardSummary(selectedTermId ?? undefined);
      setSummary(res.summary);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [selectedTermId, reloadTick, userId, role]);

  useEffect(() => {
    if (termStatus === 'ready') {
      void load();
    }
  }, [termStatus, load]);

  return (
    <section aria-labelledby="dashboard-title" className="space-y-4">
      {status === 'error' ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-red-700">Couldn&apos;t load the dashboard</p>
          <button
            type="button"
            onClick={() => setReloadTick((tick) => tick + 1)}
            className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      ) : status === 'loading' || !summary ? (
        <LoadingSkeleton scope={summary?.scope ?? (role === 'FACULTY' ? 'personal' : 'department')} />
      ) : summary.scope === 'department' ? (
        <ChairDashboard summary={summary} termLabel={term?.label ?? null} />
      ) : (
        <PersonalView summary={summary} />
      )}
    </section>
  );
}

function LoadingSkeleton({ scope }: { scope: 'department' | 'personal' }): JSX.Element {
  return (
    <div role="status" aria-label="Loading dashboard" className="space-y-4">
      <div className="flex items-center gap-4">
        <div aria-hidden="true" className="h-20 w-20 animate-pulse rounded-full bg-leaf-100" />
        <div className="space-y-2" aria-hidden="true">
          <div className="h-4 w-40 rounded bg-leaf-100" />
          <div className="h-3 w-24 rounded bg-leaf-100" />
        </div>
      </div>
      <div aria-hidden="true" className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${cardCls} animate-pulse`}>
            <div className="h-3 w-24 rounded bg-leaf-100" />
            <div className="mt-3 h-8 w-16 rounded bg-leaf-100" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className={`grid gap-4 ${scope === 'department' ? 'lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${cardCls} h-48 animate-pulse`} />
        ))}
      </div>
    </div>
  );
}

/**
 * Chair / Academic Admin dashboard — mockup-matching composition with the
 * app's leaf/ink theme: header, weekly bars, term ring, room
 * utilization, dark load panel, week preview and rooms list, all fed from
 * the (real) summary payload and animated in top-to-bottom.
 */
function ChairDashboard({
  summary,
  termLabel,
}: {
  summary: Extract<DashboardSummary, { scope: 'department' }>;
  termLabel: string | null;
}): JSX.Element {
  const user = useAuthStore((s) => s.user);

  return (
    <DashboardStagger className="space-y-4">
      <DashboardStaggerItem>
        <DashboardHeader
          greetingName={user?.email?.split('@')[0] ?? 'there'}
          termLabel={termLabel}
          scheduledPercent={summary.term_scheduled_percent}
          roomsInUsePercent={summary.rooms_in_use_percent}
          nearOrOverCount={summary.near_or_over_count}
          facultyCount={summary.faculty_count}
          subjectCount={summary.subject_count}
          roomCount={summary.room_count}
        />
      </DashboardStaggerItem>
      <DashboardStaggerItem>
        <div className="grid gap-4 lg:grid-cols-3">
          <WeeklyPlottingCard entries={summary.weekly_plotted_hours} />
          <TermProgressCard percent={summary.term_scheduled_percent} />
          <RoomUtilizationCard utilization={summary.room_utilization} />
        </div>
      </DashboardStaggerItem>
      <DashboardStaggerItem>
        <FacultyLoadPanel entries={summary.faculty_load} />
      </DashboardStaggerItem>
      <DashboardStaggerItem>
        <WeekSchedulePreview preview={summary.this_week_preview} />
      </DashboardStaggerItem>
      <DashboardStaggerItem>
        <RoomsStatusList rooms={summary.rooms_status} />
      </DashboardStaggerItem>
    </DashboardStagger>
  );
}

export function PersonalView({
  summary,
}: {
  summary: Extract<DashboardSummary, { scope: 'personal' }>;
}): JSX.Element {
  const pct =
    summary.max_units > 0 ? Math.min(100, Math.round((summary.my_scheduled_hours / summary.max_units) * 100)) : 0;
  const barCls =
    summary.load_status === 'over' ? 'bg-red-500' : summary.load_status === 'near' ? 'bg-amber-500' : 'bg-leaf-500';
  const badgeCls =
    summary.load_status === 'over'
      ? 'bg-red-100 text-red-800'
      : summary.load_status === 'near'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-leaf-100 text-leaf-700';
  if (!summary.faculty_id) {
    return (
      <div className="rounded-xl border border-dashed border-leaf-200 bg-white px-4 py-10 text-center">
        <p className="text-sm font-medium text-ink">Your account is not linked to a faculty record yet.</p>
        <p className="mt-1 text-sm text-ink/60">Ask the department chair to link your login.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className={cardCls}>
          <p className={statLabelCls}>My load</p>
          <p className={statValueCls}>
            {summary.my_scheduled_hours}h <span className="text-base font-medium text-ink/50">/ {summary.max_units}</span>
          </p>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-leaf-100"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Workload vs max load"
          >
            <div className={`h-full rounded-full ${barCls}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeCls}`}>
              {summary.load_status === 'over' ? 'Over load' : summary.load_status === 'near' ? 'Near load' : 'Within capacity'}
            </span>
          </p>
        </div>
        <StatCard label="My subjects" value={summary.my_subjects_count} />
        <StatCard label="Hours remaining" value={summary.my_remaining_hours} suffix="h" />
      </div>
      <div className={cardCls}>
        <h2 className={sectionTitleCls}>Upcoming classes</h2>
        <p className={sectionSubCls}>Earliest weekday with classes â€” {summary.faculty_name}.</p>
        {summary.todays_classes.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-leaf-200 px-3 py-4 text-center text-xs text-ink/60">
            No classes scheduled yet for this term.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {summary.todays_classes.map((cls, i) => (
              <li
                key={`${cls.day_of_week}-${cls.start_time}-${i}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-leaf-100 px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate font-mono text-sm font-medium text-ink">
                    {cls.subject_code} Â· {cls.day_of_week} {cls.start_time}â€“{cls.end_time}
                  </span>
                  <span className="block truncate text-[11px] text-ink/60">
                    {cls.subject_title} Â· {cls.section_label} Â· {cls.room_name ?? 'TBA'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {summary.my_next_class ? (
          <p className="mt-3 text-xs text-ink/60">
            Next class: {summary.my_next_class.subject_code} â€” {summary.my_next_class.day_of_week}{' '}
            {summary.my_next_class.start_time}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function StatCard({ label, value, suffix }: { label: string; value: number; suffix?: string }): JSX.Element {
  return (
    <div className={cardCls}>
      <p className={statLabelCls}>{label}</p>
      <p className={statValueCls}>
        {value}
        {suffix ? <span className="text-base font-medium text-ink/50">{suffix}</span> : null}
      </p>
    </div>
  );
}
