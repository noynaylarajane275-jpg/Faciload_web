import type { AuthRole } from '../store/auth.store';

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  allowedRoles: AuthRole[];
  /** Optional group header rendered above this item in the sidebar. */
  group?: string;
}

export const ALL_ROLES: AuthRole[] = ['CHAIR', 'FACULTY', 'ACADEMIC_ADMIN'];
export const MANAGEMENT_ROLES: AuthRole[] = ['CHAIR', 'ACADEMIC_ADMIN'];

export function isManagementRole(role: AuthRole | null | undefined): boolean {
  return role !== undefined && role !== null && MANAGEMENT_ROLES.includes(role);
}

/**
 * Single source of truth for authenticated sidebar navigation
 * (ui-ux.md §2.2/§3, requirements.md §3).
 * Role visibility mirrors the RequireAuth allowedRoles in App.tsx.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: 'dashboard', allowedRoles: ALL_ROLES },
  // Phase 1: single Faculty entry. /faculty-management stays as a valid route
  // (bookmarks/role guards unchanged) but is no longer a separate nav item.
  { label: 'Faculty Management', path: '/faculty', icon: 'faculty-manage', allowedRoles: MANAGEMENT_ROLES, group: 'People' },
  { label: 'Subjects', path: '/subjects', icon: 'subjects', allowedRoles: MANAGEMENT_ROLES, group: 'Academic Setup' },
  { label: 'Rooms', path: '/rooms', icon: 'rooms', allowedRoles: MANAGEMENT_ROLES, group: 'Academic Setup' },
  { label: 'Sections', path: '/sections', icon: 'sections', allowedRoles: MANAGEMENT_ROLES, group: 'Academic Setup' },
  { label: 'Schedule', path: '/schedule', icon: 'schedule', allowedRoles: ALL_ROLES, group: 'Workload & Scheduling' },
  { label: 'Section Schedule', path: '/views/section', icon: 'view-section', allowedRoles: MANAGEMENT_ROLES, group: 'Workload & Scheduling' },
  // Phase 1: Faculty Schedule is the single instructor grid. /workload stays as
  // a bookmark-compatible redirect (see App.tsx) but is no longer a nav item.
  { label: 'Faculty Schedule', path: '/views/faculty', icon: 'view-faculty', allowedRoles: ALL_ROLES, group: 'Workload & Scheduling' },
  { label: 'Class Program', path: '/class-program', icon: 'schedule', allowedRoles: ALL_ROLES, group: 'Workload & Scheduling' },
  { label: 'Room Schedule', path: '/views/rooms', icon: 'view-rooms', allowedRoles: MANAGEMENT_ROLES, group: 'Workload & Scheduling' },
  { label: 'Workload Assignment', path: '/workload-assignment', icon: 'assignment', allowedRoles: MANAGEMENT_ROLES, group: 'Workload & Scheduling' },
  { label: 'Reports', path: '/reports', icon: 'reports', allowedRoles: MANAGEMENT_ROLES, group: 'Reports' },
  { label: 'Account Settings', path: '/account', icon: 'account', allowedRoles: ALL_ROLES, group: 'Account' },
];

/** Legacy paths kept working via redirect (bookmarks preserved). */
export const LEGACY_REDIRECTS: Record<string, string> = {
  '/workload': '/views/faculty',
  '/faculty-management': '/faculty',
};

export function navItemsForRole(role: AuthRole | null | undefined): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => item.allowedRoles.includes(role));
}

export function navLabelForPath(pathname: string): string {
  const match = NAV_ITEMS.find((item) => item.path === pathname);
  if (match) return match.label;
  // Phase 1 legacy routes keep working via redirect; label them by destination.
  if (pathname === '/workload') return 'Faculty Schedule';
  if (pathname === '/faculty-management') return 'Faculty Management';
  if (pathname === '/not-authorized') return 'Not Authorized';
  return 'Dashboard';
}
