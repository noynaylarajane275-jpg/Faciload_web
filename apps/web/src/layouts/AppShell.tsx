import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { logoutRequest } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { useUiStore } from '../store/ui.store';
import { navItemsForRole, navLabelForPath } from '../config/navigation';
import { useTermStore } from '../store/term.store';

function initialsFor(email: string | undefined): string {
  if (!email) return '?';
  const name = email.split('@')[0] ?? '';
  const parts = name.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]?.[0]}${parts[1]?.[0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase() || '?';
}

function SideIcon({ name }: { name: string }): JSX.Element {
  const p: Record<string, JSX.Element> = {
    'view-section': (<><rect width="18" height="16" x="3" y="5" rx="2" /><path d="M3 10h18M10 5v16" /></>),
    'view-faculty': (<><rect width="18" height="16" x="3" y="5" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /><circle cx="12" cy="14" r="2" /><path d="M8.5 21a3.5 3.5 0 0 1 7 0" /></>),
    'view-rooms': (<><path d="M3 21h18" /><path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" /><path d="M15 9h4v12" /><path d="M9 8h2M9 12h2" /></>),
    dashboard: (<><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></>),
    schedule: (<><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>),
    assignment: (<><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect width="8" height="4" x="8" y="2" rx="1" /><path d="M9 12h6M9 16h6" /></>),
    faculty: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
    'faculty-manage': (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>),
    subjects: (<><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></>),
    rooms: (<><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></>),
    reports: (<><path d="M3 3v18h18" /><path d="M7 15v-4M12 17V7M17 13v-2" /></>),
    workload: (<><path d="M12 20V10M18 20V4M6 20v-4" /></>),
    account: (<><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></>),
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {p[name] ?? p.dashboard}
    </svg>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const navigate = useNavigate();
  const items = navItemsForRole(user?.role);

  async function handleLogout(): Promise<void> {
    await logoutRequest(refreshToken);
    logout();
    onNavigate?.();
    navigate('/', { replace: true });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 pb-5 pt-6">
        <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-signal-300 shadow-[0_0_0_4px_rgba(255,106,94,0.18)]" />
        <span className="sidebar-label truncate font-display text-lg font-bold tracking-tight text-ink-100">FACILOAD</span>
      </div>
      <nav aria-label="Primary" className="flex-1 space-y-4 overflow-y-auto px-3">
        {(() => {
          let lastGroup: string | null = null;
          return (
        <ul className="space-y-1">
          {items.map((item) => {
            const showGroup = item.group && item.group !== lastGroup;
            lastGroup = item.group ?? lastGroup;
            return (
            <li key={item.path}>
              {showGroup ? (
              <p className="sidebar-label px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-widest text-white/45">
                {item.group}
              </p>
              ) : null}
              <NavLink
                to={item.path}
                onClick={onNavigate}
                title={item.label}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                    isActive
                      ? 'bg-white font-semibold text-faciload-900 shadow-[0_8px_20px_-10px_rgba(0,0,0,0.45)]'
                      : 'font-medium text-white/80 hover:bg-white/15 hover:text-white'
                  }`
                }
              >
                <SideIcon name={item.icon} />
                <span className="sidebar-label truncate">{item.label}</span>
              </NavLink>
            </li>
            );
          })}
        </ul>
          );
        })()}
      </nav>
      <div className="mt-auto border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2.5">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">
            {initialsFor(user?.email)}
          </span>
          <span className="sidebar-label min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-white">{user?.email ?? ''}</span>
            <span className="block text-[11px] capitalize text-white/60">{user?.role ?? ''}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="sidebar-label mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7a0f22] to-[#4a0a16] px-3 py-2.5 text-xs font-bold text-white shadow-md transition-transform hover:brightness-110 active:scale-[0.98]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></svg>
          Log out
        </button>
      </div>
    </div>
  );
}

/**
 * Authenticated app shell (ui-ux.md 2.2).
 */
export function AppShell(): JSX.Element {
  const location = useLocation();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const isSidebarOpen = useUiStore((s) => s.isSidebarOpen);
  const closeSidebar = useUiStore((s) => s.closeSidebar);
  const pageTitle = navLabelForPath(location.pathname);

  return (
    <div className="app-bg flex h-screen">
      <aside aria-label="Sidebar" className="hidden w-16 shrink-0 border-r border-black/10 bg-gradient-to-b from-[#c81e42] via-[#8c1128] to-[#4a0a16] shadow-[12px_0_36px_-24px_rgba(74,10,22,0.9)] md:block lg:w-64 lg:[&_span.sidebar-label]:inline md:max-lg:[&_span.sidebar-label]:hidden">
        <SidebarBody />
      </aside>
      {isSidebarOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div aria-hidden="true" data-testid="sidebar-backdrop" onClick={closeSidebar} className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" />
          <aside aria-label="Sidebar" className="absolute inset-y-0 left-0 w-64 border-r border-black/10 bg-gradient-to-b from-[#c81e42] via-[#8c1128] to-[#4a0a16] shadow-[12px_0_36px_-24px_rgba(74,10,22,0.9)]">
            <SidebarBody onNavigate={closeSidebar} />
          </aside>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-3">
          <button type="button" onClick={toggleSidebar} aria-label="Open navigation menu" className="rounded-md p-2 text-slate-600 hover:bg-brand-500/10 hover:text-slate-900 md:hidden">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-leaf-400">Command Center</p>
            <h1 className="truncate text-lg font-semibold text-slate-900">{pageTitle}</h1>
          </div>
          <div className="ml-auto flex items-center gap-3 border-l border-slate-200 pl-4">
            <TermSelector />
            <button type="button" aria-label="Notifications" className="rounded-md p-2 text-slate-600 hover:bg-brand-500/10 hover:text-slate-900">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-8 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/**
 * Header Term selector — backed by the real terms API. Loads once per shell
 * mount; the selection lives in the shared term store so the Schedule page
 * (and any other page) always agrees on the working term. Defaults to the
 * active term seeded by the API seed script.
 */
function TermSelector(): JSX.Element | null {
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
    <label className="hidden items-center gap-2 text-xs text-slate-600 sm:flex">
      Term
      <select
        aria-label="Active academic term"
        value={selectedTermId ?? ''}
        onChange={(event) => selectTerm(event.target.value)}
        className="rounded-md border border-brand-500/20 bg-white/80 px-2 py-1.5 text-xs text-slate-900 outline-none transition-colors focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
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
