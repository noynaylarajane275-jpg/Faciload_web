import type { RoomUtilizationSummary } from '../../lib/dashboard';

/**
 * RoomUtilizationCard — 3-segment stacked bar (booked / maintenance / free)
 * over the full room inventory, with a legend. Segment widths animate in
 * (width transition) and collapse gracefully to 0-width when empty.
 */

const SEGMENTS: Array<{
  key: keyof RoomUtilizationSummary;
  label: string;
  barCls: string;
  dotCls: string;
}> = [
  { key: 'booked_pct', label: 'Booked', barCls: 'bg-brand-500', dotCls: 'bg-brand-500' },
  { key: 'maintenance_pct', label: 'Maintenance', barCls: 'bg-amber-400', dotCls: 'bg-amber-400' },
  { key: 'free_pct', label: 'Free', barCls: 'bg-brand-500/20', dotCls: 'bg-brand-500/30' },
];

export function RoomUtilizationCard({
  utilization,
}: {
  utilization: RoomUtilizationSummary;
}): JSX.Element {
  return (
    <div className="glass-card p-4">
      <h2 className="text-sm font-semibold text-slate-900">Room utilization</h2>
      <p className="mt-0.5 text-xs text-slate-500">Share of all rooms by current state</p>
      <div
        className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-brand-500/10"
        role="img"
        aria-label={`Rooms: ${utilization.booked_pct}% booked, ${utilization.maintenance_pct}% maintenance, ${utilization.free_pct}% free`}
      >
        {SEGMENTS.map((segment) => (
          <div
            key={segment.key}
            className={`${segment.barCls} h-full transition-[width] duration-700 ease-out`}
            style={{ width: `${utilization[segment.key]}%` }}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {SEGMENTS.map((segment) => (
          <li key={segment.key} className="flex items-center gap-2 text-xs text-slate-600">
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${segment.dotCls}`} />
            <span className="font-medium">{segment.label}</span>
            <span className="ml-auto font-mono text-slate-900">{utilization[segment.key]}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
