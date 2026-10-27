# Testing Specification

> **Current implementation status (2026-09-25):** Vitest is configured for API and web tests; Supertest is used for API route tests, and Testing Library is used for web tests. Playwright is installed as a dependency but no maintained E2E suite/config is currently present. The sections below distinguish current automated coverage from planned coverage.


## 1. Unit Tests

Test:

- **Services** — workload calculation, conflict detection, room-maintenance checks
- **Business logic** — total units/hours per faculty vs. `max_units`, overlap detection between schedule slots
- **Utilities** — time-range helpers (slot ↔ clock time conversion), Excel row/column formatting helpers
- **Validation** — subject unit/hour values, schedule time ranges (`end_time > start_time`), required faculty/subject/section fields
- **Data transformations** — mapping `WorkloadAssignment` + `ScheduleSlot` records into the weekly-grid view model, and into Excel export rows

---

## 2. API Tests

Test:

- **Authentication** — login success/failure, token expiry/refresh, inactive account rejection
- **Authorization** — Faculty-role tokens cannot hit management endpoints (e.g. create Workload Assignment or edit Faculty); Chair and Academic Admin tokens share management privileges; a Faculty user can only fetch their own workload/schedule, never another faculty member's
- **CRUD** — Faculty, Subject, Room, Section, WorkloadAssignment, ScheduleSlot endpoints
- **Validation** — rejecting duplicate subject codes, duplicate `(faculty, subject, section, term)` assignments, invalid time ranges
- **Error responses** — consistent error shape and status codes across endpoints; no internal details (stack traces, queries) leaked
- **Pagination** — Faculty/Subject/Room list endpoints
- **Filtering** — Schedule/Workload endpoints filtered by faculty, section, or term
- **Rate limiting** — login endpoint, and the Excel export endpoint if it proves expensive enough to warrant it

---

## 3. Database Tests

Test:

- **Migrations** — each migration applies cleanly on a fresh database and matches the current Prisma schema
- **Constraints** — unique constraints (`User.email`, `Subject.code`, `Room.name`, `WorkloadAssignment(faculty, subject, section, term)`) and check constraints (`ScheduleSlot.end_time > start_time`) are actually enforced
- **Relationships** — foreign keys reject orphaned references (e.g. a `ScheduleSlot` can't reference a deleted `WorkloadAssignment`)
- **Transactions** — a failed multi-step operation (e.g. creating a `WorkloadAssignment` plus its initial `ScheduleSlot`) rolls back fully, leaving no partial record
- **Seed data** — seed script produces the expected initial term, rooms, and admin/chair accounts without errors on a clean database

---

## 4. UI Tests

Test:

- **Navigation** — sidebar items shown match the logged-in role (Faculty doesn't see Faculty/Subjects/Rooms management links)
- **Forms** — Add/Edit Faculty, Subject, Room, and Workload Assignment forms
- **CRUD** — creating, editing, and deleting a class placement on the schedule grid; adding/removing a room
- **Validation** — inline error messages appear for invalid input (e.g. negative units, missing instructor)
- **Loading states** — skeleton on initial schedule load, disabled submit button while a form is saving, progress indicator during Excel export
- **Error states** — failed schedule fetch shows a retry option rather than a blank grid
- **No-refresh behavior** — placing/moving a class, saving a form, or toggling room maintenance never triggers a full page reload

---

## 5. E2E Tests

Test complete user workflows.

Example — Chair plots and revises a schedule:
```
Login (Chair)
 ↓
Navigate to Schedule
 ↓
Create (drag a class onto the weekly grid)
 ↓
Verify (class appears in the correct day/time, saved after refresh)
 ↓
Edit (move the class to a different day/time, assign a room)
 ↓
Verify (updated placement persists, no conflict flagged)
 ↓
Delete (remove the class from the grid)
 ↓
Verify (class returns to unassigned, no longer on the grid)
```

Additional critical workflows:
- Faculty logs in and views only their own workload/schedule (never another faculty member's).
- Chair assigns a subject that overloads a faculty member past `max_units` — system warns before allowing it.
- Chair drops a class into a room marked under maintenance — system warns before allowing it.
- Academic Administrator generates and downloads a workload report/Excel export, and cannot access edit/create actions.

---

## 6. Real-Time Tests

When applicable (live schedule updates):

- **Connection** — client establishes a WebSocket connection after login
- **Authentication** — the socket connection is rejected/closed if the session is invalid or expired
- **Event delivery** — a schedule change made by the Chair is received by another connected client viewing the same term
- **Reconnection** — client recovers and re-syncs schedule state after a dropped connection
- **Multiple subscribers** — two or more clients viewing the same schedule all receive the same update
- **UI update** — the receiving client's grid re-renders the change without a page reload

---

## 7. Background Job Tests

When applicable (Excel export, bulk subject import, report generation):

- **Job creation** — requesting an export/report enqueues a job rather than blocking the request
- **Processing** — the worker correctly generates the Excel file / report from current data
- **Retry** — a transient failure (e.g. temporary DB hiccup) is retried per the queue's retry policy
- **Failure** — a permanently failing job (e.g. malformed bulk-import file) is marked failed with a clear reason, not left stuck "processing"
- **Idempotency** — re-running the same export/report job doesn't create duplicate records or duplicate report files
- **Completion** — the requesting user is notified (in-app notification or email) once the job finishes, with a link to the resulting file

---

## 8. Acceptance Criteria

The application must not be considered complete until:

- [ ] All critical tests pass.
- [ ] All required features (per the Requirements doc, Section 4) have automated coverage.
- [ ] No known critical errors remain.
- [ ] Production build succeeds.
- [ ] E2E critical workflows pass, including the schedule-plotting workflow, role-based access boundaries, and conflict detection (room, faculty, maintenance).