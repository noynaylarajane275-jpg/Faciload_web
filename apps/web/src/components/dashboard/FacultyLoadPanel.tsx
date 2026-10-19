import { AvatarImage } from './AvatarImage';
import type { FacultyLoadEntry } from '../../lib/dashboard';

/**
 * FacultyLoadPanel — every faculty member with their scheduled / max units
 * and a status dot (OK / NEAR / OVER). White glass with blue accents so it
 * matches the rest of the light workspace.
 */

const STATUS_STYLES: Record<
  FacultyLoadEntry['status'],
  { dot: string; label: string; text: string }
> = {
  ok: { dot: 'bg-brand-500', label: 'OK', text: 'text-brand-500' },
  near: { dot: 'bg-amber-500', label: 'NEAR', text: 'text-amber-600' },
  over: { dot: 'bg-red-500', label: 'OVER', text: 'text-red-600' },
};

export function FacultyLoadPanel({
  entries,
}: {
  entries: FacultyLoadEntry[];
}): JSX.Element {
  return (
    <div className="glass-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Faculty load</h2>
        <span className="text-xs text-slate-500">Scheduled vs. max units</span>
      </div>
      {entries.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500">
          No faculty records yet — add them on the Faculty page.
        </p>
      ) : (
        <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
          {entries.map((entry) => {
            const style = STATUS_STYLES[entry.status];
            return (
              <li
                key={entry.faculty_id}
                className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-brand-500/5"
              >
                <AvatarImage src={entry.avatar_url} name={entry.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{entry.name}</span>
                  <span className="block truncate font-mono text-[11px] text-slate-500">
                    {entry.employee_no}
                  </span>
                </span>
                <span className="shrink-0 text-right font-mono text-xs text-slate-700">
                  {entry.scheduled_hours}/{entry.max_units}
                  <span className="ml-1 text-slate-500">units</span>
                </span>
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold ${style.text}`}
                >
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                  {style.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
