import { FacultySchedulePage } from './Views/FacultySchedulePage';
import { useAuthStore } from '../store/auth.store';

/**
 * "My Workload" — role-aware Faculty Class Program view.
 *
 * FACULTY accounts are always self-scoped (their own grid, no picker — the
 * API enforces the same rule with a 403). CHAIR keeps the picker so the page
 * never dead-ends on "not linked to a faculty record" when the chair has no
 * faculty row of their own.
 */
export function WorkloadPage(): JSX.Element {
  const role = useAuthStore((s) => s.user?.role);
  if (role === 'FACULTY') {
    return <FacultySchedulePage selfScoped heading="My Workload" />;
  }
  return <FacultySchedulePage heading="My Workload" />;
}

