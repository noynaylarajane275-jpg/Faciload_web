import type { WorkloadAssignment, WorkloadAssignmentListMeta } from '../../lib/workload-assignments';

export function AssignmentsTable(props: {
  rows: WorkloadAssignment[];
  meta: WorkloadAssignmentListMeta | null;
  page: number;
  canEdit: boolean;
  onPage: (page: number) => void;
  onEdit: (assignment: WorkloadAssignment) => void;
  onDelete: (assignment: WorkloadAssignment) => void;
}): JSX.Element {
  return (
    <div>
      <div className="overflow-x-auto rounded-2xl border border-leaf-100 bg-white shadow-sm">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead>
            <tr className="border-b border-leaf-100 bg-leaf-50/60 text-xs uppercase tracking-wide text-ink/60">
              <th scope="col" className="px-4 py-3 font-semibold">Faculty</th>
              <th scope="col" className="px-4 py-3 font-semibold">Subject</th>
              <th scope="col" className="px-4 py-3 font-semibold">Section</th>
              <th scope="col" className="px-4 py-3 font-semibold">Term</th>
              <th scope="col" className="px-4 py-3 font-semibold">Lecture hrs</th>
              <th scope="col" className="px-4 py-3 font-semibold">Lab hrs</th>
              {props.canEdit ? (
                <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((assignment) => (
              <tr key={assignment.id} className="border-b border-leaf-50 last:border-0 hover:bg-leaf-50/40">
                <td className="px-4 py-3 font-medium text-ink">{assignment.faculty_name}</td>
                <td className="px-4 py-3">
                  <span className="font-mono font-semibold text-ink">{assignment.subject_code}</span>
                  <span className="block text-xs text-slate-600">{assignment.subject_title}</span>
                </td>
                <td className="px-4 py-3 text-slate-700">{assignment.section_label}</td>
                <td className="px-4 py-3 text-slate-700">{assignment.term_label}</td>
                <td className="px-4 py-3 text-slate-700">
                  {assignment.scheduled_lecture_hours}/{assignment.lecture_hours}
                  <span className="block text-xs text-slate-500">{assignment.remaining_lecture_hours} left</span>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {assignment.scheduled_lab_hours}/{assignment.lab_hours}
                  <span className="block text-xs text-slate-500">{assignment.remaining_lab_hours} left</span>
                </td>
                {props.canEdit ? (
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        aria-label={`Edit assignment for ${assignment.faculty_name}`}
                        onClick={() => props.onEdit(assignment)}
                        className="rounded-lg border border-leaf-200 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-leaf-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete assignment for ${assignment.faculty_name}`}
                        onClick={() => props.onDelete(assignment)}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {props.meta ? (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
          <p>
            Page {props.meta.page} of {props.meta.pageCount} · {props.meta.total} assignments
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={props.page <= 1}
              onClick={() => props.onPage(Math.max(1, props.page - 1))}
              className="rounded-lg border border-leaf-200 px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={props.page >= props.meta.pageCount}
              onClick={() => props.onPage(props.page + 1)}
              className="rounded-lg border border-leaf-200 px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
