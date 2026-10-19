# FACILOAD — Industrial Engineering Faculty Workload Management System

> **Current implementation status (2026-09-25):** The core application is implemented: JWT login/refresh/logout, role-guarded REST endpoints, faculty/subject/room/section/term CRUD, workload assignments, schedule slots and conflict overrides, role-scoped schedule views, dashboard summaries, avatar upload, and responsive frontend pages. Reports/export, bulk import, email, WebSockets, Redis, and background workers are not implemented yet.

## Software Requirements Document
**Version 1.0**

---

## 1. Application Overview

### 1.1 Application Name
Industrial Engineering Faculty Workload Management System (FACILOAD)

### 1.2 Purpose
The Industrial Engineering Faculty Workload Management System is a proposed web-based system designed to efficiently manage, organize, and monitor the workload of Industrial Engineering faculty members. It aims to reduce manual workload assignment, improve accuracy, and ensure that teaching responsibilities are distributed fairly and efficiently.

The system will help administrators manage faculty teaching loads, schedules, subjects, and assignments, while allowing faculty members to easily view and monitor their assigned workload.

Core features:
- Faculty Management – add, update, and manage faculty information.
- Workload Assignment – assign subjects, units, and teaching hours to faculty members.
- Schedule Management – organize faculty schedules and class assignments.
- Workload Monitoring – track the total workload of each faculty member.
- Conflict Detection – identify overlapping schedules or excessive workloads.
- Reports Generation – generate workload summaries and reports for administrative use.
- User Accounts – provide secure access for administrators and faculty members.

Overall, the system aims to make faculty workload planning faster, more organized, transparent, and efficient.

### 1.3 Target Users
The system is primarily intended for Industrial Engineering department heads or program chairs, faculty members, and academic administrators.

### 1.4 Main Goal
The main goal of the system is to provide an efficient and organized platform for managing faculty workloads, schedules, and teaching assignments. It should minimize manual processes, prevent scheduling conflicts, promote fair workload distribution, and provide accurate workload records that support better planning and decision-making within the department.

---

## 2. Scope

### 2.1 Included
- Faculty Management – stores and manages faculty profiles, positions, and basic information.
- Workload Assignment – allows administrators to assign subjects, units, and teaching hours to faculty members.
- Subject Management – manages the subjects, units, and classes offered by the department.
- Schedule Management – organizes faculty teaching schedules, class times, and assigned rooms.
- Workload Monitoring – tracks the total teaching workload of each faculty member.
- Workload Calculation – automatically calculates teaching hours, units, and overall workload.
- Conflict Detection – identifies overlapping schedules and possible workload conflicts.
- Reports Generation – generates workload summaries and reports for administrative use.
- User Accounts – provides secure access based on user roles and permissions.
- Dashboard – displays an overview of faculty workloads, schedules, and important information.

### 2.2 Excluded
- Payroll Management – the system will not handle faculty salaries, deductions, or payments.
- Attendance Monitoring – the system will not track faculty attendance or time-in/time-out.
- Student Records – student enrollment, grades, and personal records are outside the system's scope.
- Online Learning – the system will not provide online classes, learning materials, or virtual classrooms.
- Leave Management – faculty leave requests, vacation schedules, and leave balances will not be managed.
- Faculty Recruitment – hiring, applications, and recruitment processes will not be included.
- Performance Evaluation – the system will not evaluate or rate faculty teaching performance.

---

## 3. User Roles

| Role | Description | Main Access |
|---|---|---|
| Department Head / Program Chair | Manages and oversees faculty workloads, subjects, and schedules. | Full access to faculty management, workload assignment, schedule management, conflict detection, reports, and system monitoring. |
| Faculty Member | Views and monitors assigned workload, subjects, and teaching schedule. | Can view own profile, workload, assigned subjects, and schedules; limited editing access to own information. |
| Academic Administrator | Assists in monitoring and managing workload records for administrative purposes. | Can view faculty workloads, schedules, and generate reports; cannot make workload assignments or system-level changes. |

---

## 4. Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | The system shall allow administrators to create, update, and manage faculty profiles. | High |
| FR-02 | The system shall allow the Department Head / Program Chair to assign subjects and workloads to faculty members. | High |
| FR-03 | The system shall automatically calculate the teaching hours and total workload of each faculty member. | High |
| FR-04 | The system shall allow users to view faculty teaching schedules and assigned subjects. | High |
| FR-05 | The system shall detect and notify users of overlapping schedules and workload conflicts. | High |
| FR-06 | The system shall allow authorized users to monitor faculty workload status and distribution. | High |
| FR-07 | The system shall generate workload summaries and administrative reports. | Medium |
| FR-08 | The system shall provide a dashboard displaying faculty workload and schedule information. | Medium |
| FR-09 | The system shall provide secure user login based on assigned roles and permissions. | High |
| FR-10 | The system shall allow faculty members to view their assigned workload, subjects, and schedules. | High |
| FR-11 | The system shall allow authorized users to add, update, and manage subjects and class information. | Medium |
| FR-12 | The system shall maintain and store workload and schedule records for future reference. | High |

---

## 5. General Application Behavior

- Authentication must be enforced — users must log in before accessing the system and its features.
- Authorization must be enforced server-side — the system verifies user roles and permissions before allowing access to any function.
- Role-based access must be followed — users can only view, create, update, or delete information that their assigned role permits.
- CRUD operations must be asynchronous — adding, viewing, updating, or deleting records must not require a full-page browser refresh.
- Forms must submit asynchronously — faculty, workload, subject, and schedule forms submit without reloading the page.
- The UI must update automatically — displayed information updates immediately after a successful operation.
- System states must be handled — the system provides appropriate loading, success, empty, and error states.
- Destructive actions require confirmation — deleting faculty, workload, subject, or schedule records requires explicit user confirmation.
- Server-side validation is required — all submitted information is validated on the server for accuracy, completeness, and security.
- Client-side validation may be used — the system may provide instant validation and helpful messages on forms for a better user experience.

---

## 6. Acceptance Criteria

The application is considered functionally complete when:

- [ ] All required features are implemented.
- [ ] All defined user roles work correctly.
- [ ] CRUD operations work correctly.
- [ ] Authorization restrictions work as specified per role.
- [ ] Server-side and client-side validation work as specified.
- [ ] Loading, success, empty, and error states are handled.
- [ ] The application works without unnecessary page reloads.
- [ ] Workload and schedule conflicts are correctly detected and flagged.
- [ ] Reports and dashboard views reflect accurate, up-to-date data.
- [ ] Tests pass.