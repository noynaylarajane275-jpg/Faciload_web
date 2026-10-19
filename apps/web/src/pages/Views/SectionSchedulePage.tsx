import { useCallback, useEffect, useState } from 'react';
import { listSections, type Section } from '../../lib/sections';
import { getSectionSchedule, type SectionScheduleView } from '../../lib/schedule-views';
import { selectSelectedTerm, useTermStore } from '../../store/term.store';
import { WeeklyScheduleGrid } from './WeeklyScheduleGrid';
import { NoScheduleEmptyState, TermPicker, ViewErrorState, ViewLoadingState } from './views-common';

const selectCls =
  'rounded-lg border border-leaf-100 bg-white px-2 py-1.5 text-xs text-ink outline-none transition-colors focus:border-leaf-500 focus:ring-4 focus:ring-leaf-500/15';

/**
 * "Student Class Program" — the auto-generated per-section weekly grid
 * (Mon–Sat × time), straight from the same ScheduleSlot data the
 * drag-and-drop Schedule page writes. Read-only by design: the department's
 * hand-filled form per section is replaced, not duplicated.
 */
export function SectionSchedulePage(): JSX.Element {
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

  const [sections, setSections] = useState<Section[]>([]);
  const [sectionId, setSectionId] = useState('');
  const [view, setView] = useState<SectionScheduleView | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('ready');
  const [reloadTick, setReloadTick] = useState(0);

  // Reference list for the section picker.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await listSections();
        if (!cancelled) {
          setSections(res.data);
        }
      } catch {
        // The picker stays empty; the main panel still renders its states.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadView = useCallback(async () => {
    if (!sectionId) {
      return;
    }
    setStatus('loading');
    try {
      const res = await getSectionSchedule(sectionId, selectedTermId ?? undefined);
      setView(res);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [sectionId, selectedTermId]);

  useEffect(() => {
    void loadView();
  }, [loadView, reloadTick]);

  const section = sections.find((item) => item.id === sectionId) ?? null;

  return (
    <section aria-labelledby="section-schedule-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="section-schedule-title" className="text-2xl font-semibold text-primary-dark">
            Section Schedule
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Auto-generated Student Class Program{section ? ` for ${section.label}` : ''} — every
            class the section's instructors have placed on the master schedule.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TermPicker />
          <label className="flex items-center gap-1.5 text-xs text-ink/60">
            Section
            <select
              aria-label="Select section"
              value={sectionId}
              onChange={(event) => setSectionId(event.target.value)}
              className={selectCls}
            >
              <option value="">Select…</option>
              {sections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!sectionId ? (
        <div className="rounded-xl border border-dashed border-leaf-200 bg-white px-4 py-10 text-center">
          <p className="text-sm font-medium text-ink">Pick a section to view its class program.</p>
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
          <WeeklyScheduleGrid slots={view.data} variant="section" />
        </div>
      ) : null}
    </section>
  );
}
