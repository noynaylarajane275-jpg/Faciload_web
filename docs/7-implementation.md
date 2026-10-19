# Implementation Plan

> **Current implementation status (2026-09-25):** Phases 1–3 are largely implemented in the current code, including SQLite migration/seed, authentication and RBAC, core CRUD, workload/schedule conflict handling, role-scoped views, dashboard data, avatar upload, and frontend pages/tests. Phases 4–7 remain planned or partial; this document intentionally preserves that roadmap.


## Development Rules

Implement the application incrementally.

Do not create large amounts of unverified code.

After each meaningful implementation step:

1. Run the relevant tests.
2. Check the result.
3. Fix errors.
4. Continue to the next task.

Do not stop after completing one task if more tasks remain.

---

# Phase 1 — Foundation

- [ ] Initialize project — React + TypeScript (Vite) frontend, Express + TypeScript backend, in a single repo
- [ ] Configure environment — `.env` for DB URL, JWT secret, Redis URL, per environment (dev/staging/prod)
- [ ] Configure database — PostgreSQL instance, Prisma client setup
- [ ] Configure migrations — Prisma Migrate, initial migration for the schema in `database-specification.md` (User, Faculty, Subject, Section, Room, AcademicTerm, WorkloadAssignment, ScheduleSlot)
- [ ] Configure frontend — Tailwind CSS, React Router, Zustand store shell
- [ ] Configure backend — Express app structure with route/service/repository layers, Zod validation wired in
- [ ] Configure testing — Vitest (unit), Supertest (API), Playwright (E2E) test runners installed and runnable
- [ ] Verify development environment — seed data loads, frontend talks to backend, a trivial "hello" endpoint round-trips end to end

---

# Phase 2 — Authentication

- [ ] Authentication — email/password login endpoint, password hashing
- [ ] Sessions/tokens — JWT access + refresh token issuance and rotation
- [ ] Authorization — server-side role check middleware (`CHAIR`, `FACULTY`, `ACADEMIC_ADMIN`)
- [ ] Roles — seed the three roles and confirm each maps to the access rules in `requirements.md` Section 3
- [ ] Protected routes — frontend route guards per role (e.g. Faculty never reaches `/faculty` management page)
- [ ] Tests — login success/failure, expired token rejection, role-based route/endpoint access denial

---

# Phase 3 — Core Application

- [ ] Database entities — Faculty, Subject, Section, Room, AcademicTerm, WorkloadAssignment, ScheduleSlot fully migrated
- [ ] Backend services — workload calculation service, conflict detection service (room/faculty/maintenance overlap), room-maintenance service
- [ ] API endpoints — CRUD for Faculty, Subject, Room, Section, WorkloadAssignment, ScheduleSlot
- [ ] Frontend pages — Dashboard, Schedule (drag-and-drop grid), Workload Assignment, Faculty, Subjects, Rooms, My Workload, Account Settings
- [ ] CRUD operations — all async, no full-page reloads, per `ui-ux.md` Section 5
- [ ] Validation — server-side (Zod) and client-side, per `ui-ux.md` Section 6
- [ ] Tests — unit tests on workload/conflict services, API tests on all CRUD endpoints, UI tests on core forms and the schedule grid

---

# Phase 4 — Advanced Features

- [ ] Real-time functionality — Socket.IO for live schedule updates and conflict/maintenance notifications
- [ ] Background jobs — BullMQ workers for Excel export and bulk subject-catalog import
- [ ] Notifications — in-app toast system (success/error/warning/info) plus job-completion notification for exports
- [ ] File processing — bulk subject-catalog import parsing (CSV/XLSX)
- [ ] Reports — workload summary reports (per faculty, per year/section) for Chair and Academic Administrator
- [ ] Imports/exports — Excel schedule export (per faculty, per section, department-wide)

Only implement applicable features.

---

# Phase 5 — UI/UX Completion

- [ ] Loading states — skeletons, spinners, disabled buttons per `ui-ux.md` Section 8
- [ ] Empty states — Schedule, Faculty, Subjects, My Workload, per `ui-ux.md` Section 12
- [ ] Error states — retry-capable error views per `ui-ux.md` Section 13
- [ ] Responsive behavior — desktop/tablet/mobile layouts, including the mobile single-day schedule view
- [ ] Accessibility — keyboard-operable schedule placement (alternative to drag-and-drop), focus states, ARIA live regions for notifications
- [ ] No-refresh CRUD verification — manually confirm every Create/Update/Delete flow never triggers `window.location.reload()`

---

# Phase 6 — Testing

- [ ] Unit tests — services, validation, data transformations
- [ ] Integration tests — service-layer + database interaction (e.g. creating a WorkloadAssignment and its ScheduleSlots together)
- [ ] API tests — auth, authorization, CRUD, validation, error responses, pagination, filtering
- [ ] E2E tests — Chair schedule-plotting workflow, Faculty read-only access, overload/maintenance-conflict warnings, Academic Administrator report generation
- [ ] Real-time tests — connection, event delivery, reconnection, multi-subscriber updates
- [ ] Background job tests — export/report job creation, processing, retry, failure, idempotency

---

# Phase 7 — Hardening

- [ ] Security review — role/authorization boundaries re-checked against `requirements.md` Section 3, JWT handling, password storage
- [ ] Error handling review — no internal details leaked in API error responses
- [ ] Performance review — schedule grid and dashboard queries checked against the indexes defined in `database-specification.md` Section 5
- [ ] Database migration test — full migration history re-runs cleanly on a fresh database
- [ ] Production build — frontend and backend build cleanly for production
- [ ] Deployment test — Docker + Nginx deployment runs end to end in a staging-like environment
- [ ] Documentation — README, environment setup, and this doc set kept up to date with what was actually built

---

# Definition of Done

The project is complete only when:

- [ ] Requirements are implemented (all FR-01–FR-12 from `requirements.md`).
- [ ] API works.
- [ ] Database works.
- [ ] Frontend works.
- [ ] CRUD works without unnecessary page refreshes.
- [ ] Authentication/authorization works for all three roles.
- [ ] Validation works.
- [ ] Errors are handled.
- [ ] Real-time schedule updates work.
- [ ] Background processing (exports, imports, reports) works.
- [ ] Tests pass.
- [ ] Production build succeeds.
- [ ] No critical errors remain.