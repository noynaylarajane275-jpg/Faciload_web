import type { AuthRole } from '../store/auth.store';

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  allowedRoles: AuthRole[];
}

export const ALL_ROLES: AuthRole[] = ['CHAIR', 'FACULTY', 'ACADEMIC_ADMIN'];
export const MANAGEMENT_ROLES: AuthRole[] = ['CHAIR', 'ACADEMIC_ADMIN'];

/**
 * Single source of truth for authenticated sidebar navigation
 * (ui-ux.md §2.2/§3, requirements.md §3).
 * Role visibility mirrors the RequireAuth allowedRoles in App.tsx.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: 'dashboard', allowedRoles: ALL_ROLES },
  { label: 'Schedule', path: '/schedule', icon: 'schedule', allowedRoles: ALL_ROLES },
  { label: 'Section Schedule', path: '/views/section', icon: 'view-section', allowedRoles: MANAGEMENT_ROLES },
  { label: 'Faculty Schedule', path: '/views/faculty', icon: 'view-faculty', allowedRoles: ALL_ROLES },
  { label: 'Room Schedule', path: '/views/rooms', icon: 'view-rooms', allowedRoles: MANAGEMENT_ROLES },
  { label: 'Workload Assignment', path: '/workload-assignment', icon: 'assignment', allowedRoles: MANAGEMENT_ROLES },
  { label: 'Faculty', path: '/faculty', icon: 'faculty', allowedRoles: MANAGEMENT_ROLES },
  { label: 'Faculty Management', path: '/faculty-management', icon: 'faculty-manage', allowedRoles: MANAGEMENT_ROLES },
  { label: 'Subjects', path: '/subjects', icon: 'subjects', allowedRoles: MANAGEMENT_ROLES },
  { label: 'Rooms', path: '/rooms', icon: 'rooms', allowedRoles: MANAGEMENT_ROLES },
  { label: 'Reports', path: '/reports', icon: 'reports', allowedRoles: MANAGEMENT_ROLES },
  { label: 'My Workload', path: '/workload', icon: 'workload', allowedRoles: ['CHAIR', 'FACULTY'] },
  { label: 'Account Settings', path: '/account', icon: 'account', allowedRoles: ALL_ROLES },
];

export function navItemsForRole(role: AuthRole | null | undefined): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => item.allowedRoles.includes(role));
}

export function navLabelForPath(pathname: string): string {
  const match = NAV_ITEMS.find((item) => item.path === pathname);
  if (match) return match.label;
  if (pathname === '/not-authorized') return 'Not Authorized';
  return 'Dashboard';
}
