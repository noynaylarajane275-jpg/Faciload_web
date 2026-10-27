# Database Specification

> **Current implementation status (2026-09-25):** This document describes the live Prisma schema and SQLite migration. PostgreSQL is a documented production target only; no PostgreSQL-specific constraints are active in the current local SQLite database. The API also supports avatar uploads and schedule session types/colors, which are listed below.


## 1. Database

Database:
PostgreSQL (production target)

Local development runs on SQLite (single file `apps/api/prisma/dev.db`, no container or DB server). Both use the same Prisma schema; where SQLite lacks a native type, the schema stores a portable equivalent:

| Concept | PostgreSQL (production) | SQLite (local dev) |
|---|---|---|
| `enum` columns | native `enum` | `TEXT`, with valid values documented in `schema.prisma` and enforced by Zod `z.enum` at the API layer |
| `UUID` columns | `uuid` (`@db.Uuid`) | `TEXT` (Prisma `uuid()` default, provider-independent) |
| `time` columns | `time` (`@db.Time`) | `TEXT` as canonical `"HH:MM"` (the API wire format) |
| `decimal` columns | `decimal(5, 2)` | `REAL` (`Float` — precision tradeoff acceptable for department-scale unit/hour counts) |
| `timestamptz` | `timestamptz` | `DATETIME` |

Tradeoff: local dev needs no Docker/DB server, but does not exercise Postgres-specific behavior (native enum ordering, exact decimal arithmetic, `EXCLUDE` constraints) — those remain production-time concerns.

ORM:
Prisma

Migration System:
Prisma Migrate

---

## 2. Entities

### Entity: User

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| id | UUID | Yes | auto | Primary key |
| email | string | Yes | — | Unique, login identifier |
| password_hash | string | Yes | — | Never stored or returned in plaintext |
| role | enum(`CHAIR`, `FACULTY`, `ACADEMIC_ADMIN`) | Yes | `FACULTY` | Drives RBAC checks |
| faculty_id | UUID (FK) | No | null | Links a login to a Faculty profile; null for Chair/Admin accounts not tied to a faculty record |
| is_active | boolean | Yes | true | Disables login without deleting the account |
| avatar_url | string | No | null | Local or future S3 profile-photo URL |
| created_at | timestamp (UTC) | Yes | now() | |
| updated_at | timestamp (UTC) | Yes | now() | |

---

### Entity: Faculty

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| id | UUID | Yes | auto | Primary key |
| employee_no | string | Yes | — | Unique |
| first_name | string | Yes | — | |
| last_name | string | Yes | — | |
| rank | string | No | null | e.g. Instructor I, Assistant Professor |
| employment_status | enum(`FULL_TIME`, `PART_TIME`) | Yes | `FULL_TIME` | |
| max_units | integer | Yes | 24 | Used by conflict/overload detection |
| avatar_url | string | No | null | Denormalized profile-photo URL for faculty lists/load panels |
| created_at | timestamp (UTC) | Yes | now() | |
| updated_at | timestamp (UTC) | Yes | now() | |
| deleted_at | timestamp (UTC) | No | null | Soft delete |

---

### Entity: Subject

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| id | UUID | Yes | auto | Primary key |
| code | string | Yes | — | Unique, e.g. `IE 411` |
| title | string | Yes | — | e.g. Methods Engineering |
| units | decimal | Yes | — | |
| lecture_hours | decimal | Yes | 0 | Hours per week |
| lab_hours | decimal | Yes | 0 | Hours per week |
| created_at | timestamp (UTC) | Yes | now() | |
| updated_at | timestamp (UTC) | Yes | now() | |
| deleted_at | timestamp (UTC) | No | null | Soft delete |

---

### Entity: Section

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| id | UUID | Yes | auto | Primary key |
| year_level | integer | Yes | — | 1–5 |
| name | string | Yes | — | e.g. `BSIE 3A` |
| created_at | timestamp (UTC) | Yes | now() | |
| updated_at | timestamp (UTC) | Yes | now() | |

Unique constraint on (`year_level`, `name`).

---

### Entity: Room

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| id | UUID | Yes | auto | Primary key |
| name | string | Yes | — | Unique, e.g. `IE Lab 1` |
| is_under_maintenance | boolean | Yes | false | Blocks/warns on new schedule placements |
| created_at | timestamp (UTC) | Yes | now() | |
| updated_at | timestamp (UTC) | Yes | now() | |

---

### Entity: AcademicTerm

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| id | UUID | Yes | auto | Primary key |
| school_year | string | Yes | — | e.g. `2026-2027` |
| semester | enum(`FIRST`, `SECOND`, `SUMMER`) | Yes | — | |
| is_active | boolean | Yes | false | Only one term active at a time (app-enforced) |
| created_at | timestamp (UTC) | Yes | now() | |

Unique constraint on (`school_year`, `semester`).

---

### Entity: WorkloadAssignment

Links a faculty member to a subject and section for a given term. This is the row the workload calculation (FR-03) sums up.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| id | UUID | Yes | auto | Primary key |
| faculty_id | UUID (FK) | Yes | — | References Faculty |
| subject_id | UUID (FK) | Yes | — | References Subject |
| section_id | UUID (FK) | Yes | — | References Section |
| term_id | UUID (FK) | Yes | — | References AcademicTerm |
| color | string | No | null | Optional `#RRGGBB` schedule-block color |
| created_at | timestamp (UTC) | Yes | now() | |
| updated_at | timestamp (UTC) | Yes | now() | |
| deleted_at | timestamp (UTC) | No | null | Soft delete — preserves historical workload records |

Unique constraint on (`faculty_id`, `subject_id`, `section_id`, `term_id`) — prevents the same assignment being created twice.

---

### Entity: ScheduleSlot

The actual weekly-grid placement(s) for a workload assignment. One assignment can have several slots (e.g. Mon/Wed/Fri).

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| id | UUID | Yes | auto | Primary key |
| workload_assignment_id | UUID (FK) | Yes | — | References WorkloadAssignment |
| room_id | UUID (FK) | No | null | References Room; null allowed for TBA |
| session_type | enum(`LECTURE`, `LAB`) | Yes | — | Type of class session |
| day_of_week | enum(`MON`…`SAT`) | Yes | — | |
| start_time | time | Yes | — | |
| end_time | time | Yes | — | Must be after `start_time` |
| created_at | timestamp (UTC) | Yes | now() | |
| updated_at | timestamp (UTC) | Yes | now() | |

---

### Entity: OtherFunctionSession

A faculty member's recurring weekly Research, Extension, IMP, or Consultation
session for an academic term. These sessions share the class schedule's weekday
and time grid and cannot overlap that faculty member's classes or other
function sessions.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| id | UUID | Yes | auto | Primary key |
| faculty_id | UUID (FK) | Yes | — | References Faculty |
| term_id | UUID (FK) | Yes | — | References AcademicTerm |
| function_type | enum(`RESEARCH`, `EXTENSION`, `IMP`, `CONSULTATION`) | Yes | — | Enforced by API validation |
| title | string | Yes | — | Session description |
| day_of_week | enum(`MON`…`FRI`) | Yes | — | Recurring weekday |
| start_time | time | Yes | — | Between 7:00 AM and 7:00 PM; not during lunch |
| end_time | time | Yes | — | At least one hour after `start_time`, by 7:00 PM |
| created_at | timestamp (UTC) | Yes | now() | |
| updated_at | timestamp (UTC) | Yes | now() | |

---

### Entity: FacultyDesignation

An Academic Administrator assigns named designations to a faculty member for
an academic term. Faculty can create recurring sessions only for designations
assigned to their own profile.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| id | UUID | Yes | auto | Primary key |
| faculty_id | UUID (FK) | Yes | — | References Faculty |
| term_id | UUID (FK) | Yes | — | References AcademicTerm |
| name | string | Yes | — | Unique per faculty member and term |
| created_at | timestamp (UTC) | Yes | now() | |
| updated_at | timestamp (UTC) | Yes | now() | |

---

### Entity: DesignationSession

A faculty member's recurring weekly session attached to one of their assigned
designations. Sessions must fit the weekday class-program grid and cannot
overlap classes, OtherFunctionSession entries, or other designation sessions.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| id | UUID | Yes | auto | Primary key |
| designation_id | UUID (FK) | Yes | — | References FacultyDesignation |
| title | string | Yes | — | Session description |
| day_of_week | enum(`MON`…`FRI`) | Yes | — | Recurring weekday |
| start_time | time | Yes | — | Between 7:00 AM and 7:00 PM; not during lunch |
| end_time | time | Yes | — | Must be after `start_time`; no minimum duration |
| created_at | timestamp (UTC) | Yes | now() | |
| updated_at | timestamp (UTC) | Yes | now() | |

---

## 3. Relationships

```text
User
 └── belongs to Faculty (optional, 1:1)

Faculty
 └── has many WorkloadAssignment
 └── has many OtherFunctionSession
 └── has many FacultyDesignation

Subject
 └── has many WorkloadAssignment

Section
 └── has many WorkloadAssignment

AcademicTerm
 └── has many WorkloadAssignment
 └── has many OtherFunctionSession
 └── has many FacultyDesignation

WorkloadAssignment
 ├── belongs to Faculty
 ├── belongs to Subject
 ├── belongs to Section
 ├── belongs to AcademicTerm
 └── has many ScheduleSlot

ScheduleSlot
 ├── belongs to WorkloadAssignment
 └── belongs to Room (optional)

OtherFunctionSession
 ├── belongs to Faculty
 └── belongs to AcademicTerm

FacultyDesignation
 ├── belongs to Faculty
 ├── belongs to AcademicTerm
 └── has many DesignationSession

DesignationSession
 └── belongs to FacultyDesignation

Room
 └── has many ScheduleSlot
```

---

## 4. Constraints

- **Primary keys:** UUID on every entity.
- **Foreign keys:** `User.faculty_id → Faculty.id`; `WorkloadAssignment.faculty_id → Faculty.id`; `WorkloadAssignment.subject_id → Subject.id`; `WorkloadAssignment.section_id → Section.id`; `WorkloadAssignment.term_id → AcademicTerm.id`; `ScheduleSlot.workload_assignment_id → WorkloadAssignment.id`; `ScheduleSlot.room_id → Room.id`; `OtherFunctionSession.faculty_id → Faculty.id`; `OtherFunctionSession.term_id → AcademicTerm.id`; `FacultyDesignation.faculty_id → Faculty.id`; `FacultyDesignation.term_id → AcademicTerm.id`; `DesignationSession.designation_id → FacultyDesignation.id`.
- **Unique constraints:** `User.email`; `Faculty.employee_no`; `Subject.code`; `Room.name`; `Section(year_level, name)`; `AcademicTerm(school_year, semester)`; `WorkloadAssignment(faculty_id, subject_id, section_id, term_id)`; `FacultyDesignation(faculty_id, term_id, name)`.
- **Required fields:** as marked `Yes` in each entity table above.
- **Check constraints:** `ScheduleSlot.end_time > start_time`; `Faculty.max_units > 0`; `Subject.units > 0`.
- **Delete behavior:**
  - `Faculty`, `Subject`, `Room` → soft delete (or restrict) when referenced by any `WorkloadAssignment`/`ScheduleSlot`, so historical schedules and workload reports are never orphaned.
  - `WorkloadAssignment` → soft delete; deleting it cascades a soft/hard delete to its `ScheduleSlot` rows.
  - `AcademicTerm`, `Section` → restrict deletion if any `WorkloadAssignment` references them.
  - `OtherFunctionSession` → hard delete when its faculty profile or academic term is deleted.
  - `FacultyDesignation` → hard delete when its faculty profile or academic term is deleted; assigned sessions cascade with it.

---

## 5. Indexes

- `User.email` (unique lookup — login)
- `Faculty.employee_no` (unique lookup)
- `Subject.code` (unique lookup, frequently searched when building the catalog)
- `WorkloadAssignment.faculty_id` (workload-per-faculty queries, FR-03/FR-06)
- `WorkloadAssignment.term_id` (filtering the active term)
- `ScheduleSlot.room_id, day_of_week` (composite — room-conflict checks)
- `ScheduleSlot.workload_assignment_id, day_of_week` (composite — faculty-conflict checks)
- `OtherFunctionSession.faculty_id, term_id, day_of_week` (faculty's term sessions and conflict checks)
- `FacultyDesignation.faculty_id, term_id` (assigned designation lookups)
- `DesignationSession.designation_id, day_of_week` (designation sessions and conflict checks)

Keep indexes focused on the department's common lookups and conflict checks; the tables are small, so avoid indexes without a clear query need.

---

## 6. Timestamps

All entities include `created_at` and `updated_at`, stored in UTC. `ScheduleSlot.start_time`/`end_time` and `OtherFunctionSession.start_time`/`end_time` are stored as local wall-clock time (department operates in a single timezone), not UTC, since they represent recurring weekly slots rather than fixed instants.

---

## 7. Soft Delete

`Faculty`, `Subject`, and `WorkloadAssignment` use `deleted_at` soft deletion, since historical workload and schedule records must remain available for past-term reports even after a faculty member leaves or a subject is discontinued.

Soft-deleted records are excluded from active selectors (faculty rosters, subject catalog dropdowns, current-term workload views) by default, and only included when a query explicitly asks for historical/archived data (e.g. a past-term report).

`Room`, `ScheduleSlot`, and `OtherFunctionSession` are hard-deleted, since a removed resource or an edited/cancelled session has no standalone reporting value once its parent data is preserved.

---

## 8. Migrations

All schema changes go through Prisma Migrate. Every schema change has a corresponding migration file committed alongside the code that depends on it.

An already-released migration is never edited to accommodate a new change — a new migration is created instead, even for small corrections, so that every environment that already applied the old migration stays consistent.

---

## 9. Seed Data

- **AcademicTerm:** one active term for local/dev environments (e.g. `2026-2027`, `FIRST`, `is_active = true`).
- **Rooms:** the department's known rooms (e.g. `IE Lab 1`, `IE Lab 2`, `Room 301`, `Room 302`).
- **Users:** one seeded Chair account and one seeded Academic Administrator account for initial login.
- **Subjects (optional):** a starter IE subject catalog (e.g. `IE 105`, `IE 322`, `IE 411`) so the schedule grid isn't empty on first run.

---

## 10. Data Integrity

Database constraints protect the rules that matter most, in addition to application-level validation performed by the service layer:

- The unique constraint on `WorkloadAssignment(faculty_id, subject_id, section_id, term_id)` prevents duplicate assignments at the database level, even if application-level validation is ever bypassed or has a bug.
- The `end_time > start_time` rule is enforced by API validation/service logic for the current SQLite schema. A database-level check or PostgreSQL `EXCLUDE` constraint remains a future production hardening option, not a current SQLite guarantee.
- Foreign keys guarantee that a `ScheduleSlot` or `WorkloadAssignment` cannot reference a missing faculty, subject, section, term, or room.
- For stronger protection against double-booking, an optional PostgreSQL `EXCLUDE` constraint (via the `btree_gist` extension) can be added on `ScheduleSlot(room_id, day_of_week, time-range)` to reject overlapping room bookings at the database level, as a backstop to the application-level conflict detection (FR-05). (PostgreSQL-only: this constraint cannot run on the SQLite local-dev database; the application-level conflict checks remain the backstop there.)
---

## 11. Current API and Schema Notes

The current Prisma schema also includes these fields/features:

- `User.avatar_url` and `Faculty.avatar_url` store local profile-photo URLs; `POST /api/users/me/avatar` accepts JPG, PNG, or WebP up to 2 MB.
- `WorkloadAssignment.color` stores an optional `#RRGGBB` schedule-block color.
- `ScheduleSlot.session_type` is `LECTURE` or `LAB`.
- The current `end_time > start_time` rule is enforced by API validation/service logic for SQLite. A database-level check or PostgreSQL `EXCLUDE` constraint remains a future production hardening option.
- `PATCH /api/rooms/:id` also toggles `is_under_maintenance`.
- `POST /api/schedule-slots/:id/confirm-override` is available to Chairs and Academic Admins as the explicit override path after a conflict response.
- `GET /api/schedule-views/*` provides section, faculty, room, and rooms-overview read views; Faculty callers are restricted to their own faculty schedule where applicable.
