import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Reveal } from './motion';
import { ChartPieIcon, GridIcon, WarningIcon } from './icons';

type TabId = 'grid' | 'workload' | 'conflicts';

const TABS: Array<{ id: TabId; label: string; icon: (p: { className?: string }) => JSX.Element }> = [
  { id: 'grid', label: 'Weekly Matrix', icon: GridIcon },
  { id: 'workload', label: 'Unit Load Balancer', icon: ChartPieIcon },
  { id: 'conflicts', label: 'Live Conflict Guard', icon: WarningIcon },
];

/** Small schedule block used in the mock weekly matrix. */
function Block({
  time,
  course,
  meta,
  tone = 'ok',
}: {
  time?: string;
  course: string;
  meta?: string;
  tone?: 'ok' | 'alt' | 'conflict';
}): JSX.Element {
  const tones: Record<string, string> = {
    ok: 'bg-faciload-600/60 border-faciload-400/30',
    alt: 'bg-indigo-900/60 border-indigo-500/40',
    conflict: 'bg-rose-900/60 border-rose-500/50',
  };
  if (time) {
    return <div className="flex items-center p-2 font-mono text-[11px] text-white/60">{time}</div>;
  }
  return (
    <div className={`flex flex-col justify-between rounded-xl border p-3 font-jakarta ${tones[tone]}`}>
      <span className="flex items-center gap-1 text-[11px] font-bold text-white">
        {tone === 'conflict' && <WarningIcon className="h-3 w-3 text-amber-300" />}
        {course}
      </span>
      {meta && <span className="text-[9px] text-white/70">{meta}</span>}
    </div>
  );
}

function OpenCell(): JSX.Element {
  return (
    <div className="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-3 font-jakarta text-white/40">
      Open
    </div>
  );
}

/** Weekly Matrix tab — a Mon–Sat mock timetable with one flagged clash. */
function GridTab(): JSX.Element {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-bold text-white">Industrial Technology Master Timetable</h3>
          <p className="text-xs text-white/60">
            Drag and drop class blocks across Monday to Saturday slots.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-white/10 px-3 py-1 text-xs text-white/85">Room 402 Lab</span>
          <span className="rounded-lg bg-white/10 px-3 py-1 text-xs text-white/85">24 Active Sections</span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 font-mono text-xs">
        <div className="p-2 font-bold text-white/50">Time</div>
        {days.map((d) => (
          <div key={d} className="rounded-lg bg-white/10 p-2 text-center font-bold text-white">
            {d}
          </div>
        ))}

        <Block time="08:00 AM" course="" />
        <Block course="IT 101 · Work Systems" meta="Dr. A. Santos (Rm 301)" />
        <OpenCell />
        <Block course="IT 101 · Work Systems" meta="Dr. A. Santos (Rm 301)" />
        <OpenCell />
        <Block tone="conflict" course="IT 150 Lab" meta="Room double-booked" />
        <OpenCell />

        <Block time="10:00 AM" course="" />
        <OpenCell />
        <Block tone="alt" course="IT 141 · Ergonomics" meta="Prof. M. Reyes (Lab A)" />
        <OpenCell />
        <Block tone="alt" course="IT 141 · Ergonomics" meta="Prof. M. Reyes (Lab A)" />
        <OpenCell />
        <Block course="IT Sat Class" meta="Engr. T. Cruz" />
      </div>
    </div>
  );
}

/** Unit Load Balancer tab — per-faculty unit totals with balance meters. */
function WorkloadTab(): JSX.Element {
  const faculty = [
    { name: 'Dr. Amanda Santos', units: '18 / 18 Units', tone: 'ok', width: 'w-full', note: 'Max teaching load reached (no overload)' },
    { name: 'Prof. Miguel Reyes', units: '21 / 18 Units', tone: 'warn', width: 'w-[90%]', note: '3 units approved overload' },
    { name: 'Engr. Tess Cruz', units: '15 / 18 Units', tone: 'ok2', width: 'w-[80%]', note: 'Available for thesis advising' },
  ];
  const barTones: Record<string, string> = { ok: 'bg-faciload-500', warn: 'bg-amber-500', ok2: 'bg-emerald-500' };
  const chipTones: Record<string, string> = {
    ok: 'bg-faciload-500/20 text-faciload-300',
    warn: 'bg-amber-500/20 text-amber-300',
    ok2: 'bg-emerald-500/20 text-emerald-300',
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">Faculty Load Unit Totals (Automatic)</h3>
        <span className="rounded-lg border border-emerald-500/30 bg-emerald-950/60 px-3 py-1 text-xs text-emerald-400">
          All Faculty Balanced
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 font-jakarta sm:grid-cols-3">
        {faculty.map((f) => (
          <div key={f.name} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold text-white">{f.name}</span>
              <span className={`rounded px-2 py-0.5 text-xs ${chipTones[f.tone]}`}>{f.units}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className={`h-full ${barTones[f.tone]} ${f.width}`} />
            </div>
            <p className="mt-2 text-[11px] text-white/50">{f.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Live Conflict Guard tab — a detected room collision with a one-click fix. */
function ConflictsTab(): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">Real-Time Constraint Linter</h3>
        <span className="rounded-lg border border-rose-500/30 bg-rose-950/60 px-3 py-1 text-xs text-rose-400">
          1 Active Warning
        </span>
      </div>
      <div className="space-y-3 font-jakarta">
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/40 bg-rose-950/30 p-4">
          <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-rose-500/20 text-rose-400">
            <WarningIcon className="h-4 w-4" />
          </div>
          <div className="flex-grow">
            <div className="flex justify-between">
              <span className="text-sm font-semibold text-white">Room Collision Detected</span>
              <span className="font-mono text-[10px] text-rose-300">Friday 08:00 AM</span>
            </div>
            <p className="mt-1 text-xs text-white/70">
              IT 150 Lab and IT 199 Senior Project are both assigned to Manufacturing Lab Room 3.
              One click to reassign.
            </p>
            <button
              type="button"
              className="mt-3 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-500"
            >
              Auto-Resolve Conflict
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Command Center (`#features`) — the reference's interactive dashboard mockup.
 * A dark glass "app window" with a tab bar switching between the weekly matrix,
 * the unit-load balancer, and the live conflict guard. Purely presentational;
 * tabs are local React state (reduced-motion aware).
 */
export function Features(): JSX.Element {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<TabId>('grid');
  return (
    <section id="features" aria-labelledby="features-title" className="px-4 sm:px-6">
      <div className="mx-auto mt-20 max-w-6xl">
        <Reveal>
          <div className="mb-12 text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-faciload-300">
              Command Center Interface
            </span>
            <h2
              id="features-title"
              className="font-jakarta mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl"
            >
              Designed for absolute clarity
            </h2>
            <p className="mt-2 text-rose-100/70">
              Explore the views that eliminate spreadsheet fatigue forever.
            </p>
          </div>
        </Reveal>

        {/* Tab bar */}
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`flex items-center gap-2 rounded-full border border-faciload-200 px-5 py-2.5 text-sm font-semibold transition-all ${
                tab === t.id
                  ? 'bg-faciload-800 text-white shadow-lg'
                  : 'bg-white/80 text-slate-600 hover:bg-white'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* App-window mockup */}
        <motion.div
          initial={reduce ? undefined : { opacity: 0, y: 20 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-64px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="glass-dark relative overflow-hidden rounded-3xl p-4 shadow-2xl sm:p-8"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 h-96 w-96 rounded-full bg-faciload-500/10 blur-3xl"
          />

          {/* Window chrome */}
          <div className="relative mb-6 flex items-center justify-between border-b border-white/10 pb-6">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-400" />
              <span className="h-3 w-3 rounded-full bg-amber-400" />
              <span className="h-3 w-3 rounded-full bg-emerald-400" />
              <span className="ml-4 font-mono text-xs text-white/60">
                faciload.app/ind-tech/schedule-2026
              </span>
            </div>
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-white/85">
              <span aria-hidden="true" className="text-[8px] text-emerald-400">
                ●
              </span>
              Term Active · 1st Semester
            </span>
          </div>

          {/* Tab panel */}
          <div className="relative">
            {tab === 'grid' && <GridTab />}
            {tab === 'workload' && <WorkloadTab />}
            {tab === 'conflicts' && <ConflictsTab />}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
