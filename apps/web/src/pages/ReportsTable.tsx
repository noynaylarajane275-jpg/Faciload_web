import type { FacultyWorkloadRow } from '../lib/reports';

export function StatCard({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-2xl border border-leaf-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

export function WorkloadTable({ rows }: { rows: FacultyWorkloadRow[] }): JSX.Element {
  return (
    <div className="overflow-x-auto rounded-2xl border border-leaf-100 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-leaf-100 text-left text-xs uppercase tracking-wide text-ink/60">
            <th scope="col" className="px-4 py-3 font-semibold">Faculty</th>
            <th scope="col" className="px-4 py-3 font-semibold">Subjects</th>
            <th scope="col" className="px-4 py-3 font-semibold">Weekly</th>
            <th scope="col" className="px-4 py-3 font-semibold">Scheduled</th>
            <th scope="col" className="px-4 py-3 font-semibold">Remaining</th>
            <th scope="col" className="px-4 py-3 font-semibold">Max units</th>
            <th scope="col" className="px-4 py-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.faculty_id} className="border-b border-leaf-100/60 last:border-0 hover:bg-leaf-50">
              <td className="px-4 py-2.5">
                <span className="block font-medium text-ink">{row.faculty_name}</span>
                {row.employee_no ? (
                  <span className="block font-mono text-[11px] text-ink/60">{row.employee_no}</span>
                ) : null}
              </td>
              <td className="px-4 py-2.5 font-mono tabular-nums text-ink">{row.subjects}</td>
              <td className="px-4 py-2.5 font-mono tabular-nums text-ink">{row.weekly_hours}h</td>
              <td className="px-4 py-2.5 font-mono tabular-nums text-ink">{row.scheduled_hours}h</td>
              <td className="px-4 py-2.5 font-mono tabular-nums text-ink">{row.remaining_hours}h</td>
              <td className="px-4 py-2.5 font-mono tabular-nums text-ink">{row.max_units}</td>
              <td className="px-4 py-2.5">
                <StatusBadge status={row.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: 'ok' | 'near' | 'over' }): JSX.Element {
  const cls =
    status === 'over'
      ? 'bg-red-100 text-red-700'
      : status === 'near'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-leaf-100 text-leaf-700';
  const label = status === 'over' ? 'Over load' : status === 'near' ? 'Near load' : 'Within capacity';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>
  );
}
