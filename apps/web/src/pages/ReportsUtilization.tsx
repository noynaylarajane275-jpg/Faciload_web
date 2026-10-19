export function UtilizationPanel({
  utilization,
  unscheduled,
  mostBooked,
}: {
  utilization: { booked_pct: number; maintenance_pct: number; free_pct: number } | null;
  unscheduled: number;
  mostBooked: Array<{ room_id: string; room_name: string; booked_hours: number; slot_count: number }>;
}): JSX.Element {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border border-leaf-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Room utilization</h2>
        {utilization ? (
          <>
            <div
              className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-leaf-100"
              role="img"
              aria-label={`Booked ${utilization.booked_pct} percent`}
            >
              <div className="bg-leaf-500" style={{ width: `${utilization.booked_pct}%` }} />
              <div className="bg-amber-400" style={{ width: `${utilization.maintenance_pct}%` }} />
            </div>
            <p className="mt-2 font-mono text-xs tabular-nums text-ink/70">
              Booked {utilization.booked_pct}% · Maint {utilization.maintenance_pct}% · Free {utilization.free_pct}%
            </p>
          </>
        ) : (
          <p className="mt-2 text-xs text-ink/60">No utilization data for this term.</p>
        )}
        <p className="mt-3 text-xs text-ink/60">
          {unscheduled} unscheduled {unscheduled === 1 ? 'assignment' : 'assignments'} remaining.
        </p>
      </div>
      <div className="rounded-2xl border border-leaf-100 bg-white p-4 shadow-sm lg:col-span-2">
        <h2 className="text-sm font-semibold text-ink">Most-booked rooms</h2>
        {mostBooked.length === 0 ? (
          <p className="mt-2 text-xs text-ink/60">No booked rooms for this term yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {mostBooked.slice(0, 5).map((room) => (
              <li key={room.room_id} className="flex items-center justify-between gap-3 rounded-lg border border-leaf-100 px-3 py-2">
                <span className="truncate font-mono text-xs font-medium text-ink">{room.room_name}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-ink/60">
                  {room.booked_hours}h · {room.slot_count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
