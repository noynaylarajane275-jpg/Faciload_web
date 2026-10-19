import { useEffect } from 'react';
import { useTermStore } from '../../store/term.store';

/**
 * Small building blocks shared by the three read-only schedule views
 * (Section / Faculty / Room). The Term picker is wired to the same store as
 * the header selector, so every view agrees on the working term.
 */

const selectCls =
  'rounded-lg border border-brand-500/20 bg-white/80 px-2 py-1.5 text-xs text-slate-900 outline-none transition-colors focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15';

/** Term selector bound to the shared term store (kept in sync with the header). */
export function TermPicker(): JSX.Element | null {
  const terms = useTermStore((s) => s.terms);
  const status = useTermStore((s) => s.status);
  const selectedTermId = useTermStore((s) => s.selectedTermId);
  const loadTerms = useTermStore((s) => s.loadTerms);
  const selectTerm = useTermStore((s) => s.selectTerm);

  useEffect(() => {
    if (status === 'idle') {
      void loadTerms();
    }
  }, [status, loadTerms]);

  if (status === 'error' || (status === 'ready' && terms.length === 0)) {
    return null;
  }

  return (
    <label className="flex items-center gap-1.5 text-xs text-ink/60">
      Term
      <select
        aria-label="Select term"
        value={selectedTermId ?? ''}
        onChange={(event) => selectTerm(event.target.value)}
        className={selectCls}
      >
        {terms.length === 0 ? (
          <option value="">Loading…</option>
        ) : (
          terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.label}
            </option>
          ))
        )}
      </select>
    </label>
  );
}

export function ViewLoadingState(): JSX.Element {
  return (
    <p
      role="status"
      className="glass-card px-4 py-8 text-center text-sm text-slate-600"
    >
      Loading schedule…
    </p>
  );
}

export function ViewErrorState({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-8 text-center">
      <p className="text-sm font-medium text-red-700">Could not load the schedule.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
      >
        Retry
      </button>
    </div>
  );
}

/**
 * Step 3 empty state: a section / faculty member / room with nothing placed
 * in the selected term gets this instead of a blank grid.
 */
export function NoScheduleEmptyState(): JSX.Element {
  return (
    <div
      role="status"
      className="glass-card border-dashed px-4 py-10 text-center"
    >
      <p className="text-sm font-medium text-slate-900">No classes scheduled yet for this term.</p>
      <p className="mt-1 text-sm text-slate-600">
        Place classes on the Schedule page — this view fills in automatically from the same data.
      </p>
    </div>
  );
}
