import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Landing } from './pages/Landing/Landing';
import { LoginModal } from './components/auth/LoginModal';
import { SessionBootstrap } from './components/auth/SessionBootstrap';
import { AppShell } from './layouts/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { SubjectsPage } from './pages/SubjectsPage';
import { FacultyPage } from './pages/FacultyPage';
import { SchedulePage } from './pages/Schedule/SchedulePage';
import { SectionSchedulePage } from './pages/Views/SectionSchedulePage';
import { FacultySchedulePage } from './pages/Views/FacultySchedulePage';
import { RoomSchedulePage } from './pages/Views/RoomSchedulePage';
import { ClassProgramPage } from './pages/ClassProgramPage';
import { WorkloadAssignmentPage } from './pages/WorkloadAssignment/WorkloadAssignmentPage';
import { RoomsPage } from './pages/RoomsPage';
import { ReportsPage } from './pages/ReportsPage';
import { AccountSettingsPage } from './pages/AccountSettingsPage';
import { NotAuthorizedPage } from './pages/NotAuthorizedPage';
import { RequireAuth } from './components/RequireAuth';
import { ToastProvider } from './components/Toast';
import { ALL_ROLES, MANAGEMENT_ROLES } from './config/navigation';
import type { AuthRole } from './store/auth.store';

/** Reports: Chair + Academic Admin (ui-ux.md §4). */
const REPORTS_ROLES: AuthRole[] = ['CHAIR', 'ACADEMIC_ADMIN'];

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      {/* Boot-time session restore — must wrap the router content so the
          check runs before RequireAuth makes any redirect decision. */}
      <SessionBootstrap>
        <ToastProvider>
        <LoginModal />
        <Routes>
          {/* Public landing: full-bleed marketing layout (own nav/footer). */}
          <Route path="/" element={<Landing />} />
          {/* Direct-link entry: same landing base with modal open on mount. */}
          <Route path="/login" element={<Landing openLoginOnMount />} />
          {/* Authenticated-app shell (nav + constrained content width). */}
          <Route element={<AppShell />}>
            <Route path="/not-authorized" element={<NotAuthorizedPage />} />
            <Route
              path="/dashboard"
              element={
                <RequireAuth allowedRoles={ALL_ROLES}>
                  <DashboardPage />
                </RequireAuth>
              }
            />
            <Route
              path="/schedule"
              element={
                <RequireAuth allowedRoles={ALL_ROLES}>
                  <SchedulePage />
                </RequireAuth>
              }
            />
            {/* Read-only schedule views (the paper-form replacements).
                Faculty role sees only their own program; management can pick
                any section / faculty / room. */}
            <Route
              path="/views/section"
              element={
                <RequireAuth allowedRoles={MANAGEMENT_ROLES}>
                  <SectionSchedulePage />
                </RequireAuth>
              }
            />
            <Route
              path="/views/faculty"
              element={
                <RequireAuth allowedRoles={ALL_ROLES}>
                  <FacultySchedulePage />
                </RequireAuth>
              }
            />
            <Route
              path="/class-program"
              element={
                <RequireAuth allowedRoles={ALL_ROLES}>
                  <ClassProgramPage />
                </RequireAuth>
              }
            />
            <Route
              path="/class-program/:facultyId"
              element={
                <RequireAuth allowedRoles={ALL_ROLES}>
                  <ClassProgramPage />
                </RequireAuth>
              }
            />
            <Route
              path="/views/rooms"
              element={
                <RequireAuth allowedRoles={MANAGEMENT_ROLES}>
                  <RoomSchedulePage />
                </RequireAuth>
              }
            />
            <Route
              path="/workload"
              element={
                <RequireAuth allowedRoles={['CHAIR', 'FACULTY']}>
                  <Navigate to="/views/faculty" replace />
                </RequireAuth>
              }
            />
            <Route
              path="/workload-assignment"
              element={
                <RequireAuth allowedRoles={MANAGEMENT_ROLES}>
                  <WorkloadAssignmentPage />
                </RequireAuth>
              }
            />
            <Route
              path="/rooms"
              element={
                <RequireAuth allowedRoles={MANAGEMENT_ROLES}>
                  <RoomsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/subjects"
              element={
                <RequireAuth allowedRoles={MANAGEMENT_ROLES}>
                  <SubjectsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/faculty"
              element={
                <RequireAuth allowedRoles={MANAGEMENT_ROLES}>
                  <FacultyPage />
                </RequireAuth>
              }
            />
            {/* Faculty Management — the write side of the faculty module
                (create / edit / delete + opt-in login accounts). Kept as its
                own route so /faculty stays strictly read-only. */
            /* Phase 1: single /faculty route renders the directory; management
               controls are role-gated inside the component (CHAIR-only), so the
               separate /faculty-management path redirects here for bookmarks. */}
            <Route
              path="/faculty-management"
              element={
                <RequireAuth allowedRoles={MANAGEMENT_ROLES}>
                  <Navigate to="/faculty" replace />
                </RequireAuth>
              }
            />
            <Route
              path="/reports"
              element={
                <RequireAuth allowedRoles={['CHAIR', 'ACADEMIC_ADMIN']}>
                  <ReportsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/account"
              element={
                <RequireAuth allowedRoles={ALL_ROLES}>
                  <AccountSettingsPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        </ToastProvider>
      </SessionBootstrap>
    </BrowserRouter>
  );
}

