# UI / UX Specification

> **Current implementation status (2026-09-25):** The landing page, authenticated sidebar shell, role-filtered routes, schedule editing/read-only views, management forms, dashboard, My Workload, Account Settings avatar upload, loading/empty/error/toast states, and responsive layouts are implemented. The Reports page is currently a placeholder; WebSocket-driven live updates and report/export UI are not implemented.


## 1. Design System

Framework:
Tailwind CSS

Design direction:
Green and white, in the same spirit as a drafting/engineering board — a clean white workspace with a confident green accent used for primary actions, active states, and success feedback. Green also doubles as a natural "available/clear" signal (rooms, schedules) and reads as calm and departmental rather than corporate-SaaS. Data-dense labels (course codes, room names, time slots) use a monospace face for scannability; headings and UI copy use a single clean sans-serif. Layout favors flat panels with hairline borders over heavy drop shadows or rounded card stacks, keeping the interface feeling like a working tool rather than a marketing page.

### 1.1 Color Tokens

This is the locked palette. All current and future pages (marketing and in-app) must pull from these tokens rather than introducing new ad-hoc colors.

| Token | Hex | Usage |
|---|---|---|
| `ink` | `#10241A` | Primary text, dark surfaces (dark sidebar/hero backgrounds) |
| `leaf-50` | `#EEFBF2` | Soft backgrounds, hover states, pill backgrounds |
| `leaf-100` | `#D7F5E2` | Hairline borders, dividers on light surfaces |
| `leaf-300` | `#8FE3B4` | Secondary/lighter accents (e.g. secondary schedule blocks) |
| `leaf-500` | `#2FBF71` | Primary brand green — buttons, active nav item, focus rings, key numbers |
| `leaf-600` | `#1F8F52` | Hover state for primary green elements |
| `leaf-700` | `#166B3E` | Text-on-light green (pill text, link text) |
| Dark surface | `#132A1D` | Dark section backgrounds (e.g. Roles section, dark sidebar) |

Fonts: `Space Grotesk` (headings/UI copy), `IBM Plex Mono` (codes, room names, time labels, data-dense values).

### 1.2 Core Component Patterns

These patterns are now standard and should be reused rather than redesigned per page:

- **Buttons:** primary action = `bg-leaf-500 text-[#08130D] font-semibold hover:bg-leaf-600 hover:text-white`, plus `hover:scale-[1.03] active:scale-[0.98]` micro-interaction (respecting `prefers-reduced-motion`).
- **Modals:** fixed overlay, `bg-ink/40 backdrop-blur-sm` backdrop, centered white card with `rounded-2xl`, a `h-1.5` top gradient accent bar (`from-leaf-500 via-leaf-300 to-leaf-500`), soft square close button (`bg-leaf-50 hover:bg-leaf-100 rounded-lg`), fade+scale entrance via framer-motion. This is the standard for any future create/edit/confirm dialog, not just Login.
- **Form inputs:** leading icon, `border-leaf-100`, focus state `border-leaf-500 ring-4 ring-leaf-500/15`.
- **Error banners:** `bg-red-50 border-red-200 text-red-700` with a small circular "!" icon.
- **Cards/panels:** flat, hairline `border-leaf-100`, `hover:bg-leaf-50` on interactive rows.

---

## 2. Layout

The application has two distinct shells: the **public/marketing shell** (Landing page) and the **authenticated app shell** (Dashboard and everything a logged-in user reaches). They are not the same layout.

### 2.1 Public shell (Landing page only)
Top nav bar + full-width sections (Hero, Features, Roles, CTA, Footer), as already built. This shell does not apply once a user is authenticated.

### 2.2 Authenticated app shell (Dashboard, Schedule, Workload Assignment, Faculty, Subjects, Rooms, Reports, My Workload, Account Settings)

**This replaces any earlier top-nav-only assumption for these pages.** The authenticated app uses a persistent **left sidebar** layout, not a top nav bar, for all roles (Chair, Faculty, Academic Administrator) — only the items listed in the sidebar differ per role, per `requirements.md` Section 3.

#### Desktop
- Fixed left sidebar (dark `ink`/`#132A1D` background, matching the Roles section treatment): FACILOAD brand mark at top, role-filtered navigation items below (Dashboard, Schedule, Workload Assignment, Faculty, Subjects, Rooms, Reports, My Workload), active item highlighted with a `leaf-500` left-border accent and `leaf-500`-tinted background, user/account menu pinned at the bottom of the sidebar.
- Top header bar within the main content area (not full-width across the sidebar): page title, active academic term selector, notification icon — this header does NOT contain primary navigation; navigation lives only in the sidebar.
- Main content area to the right of the sidebar. The Schedule page uses the full content width for the weekly grid; a right-hand panel within that page lists unassigned classes and rooms (as in the current prototype).

#### Tablet
Sidebar collapses to icon-only (expandable on tap/hover). Weekly grid becomes horizontally scrollable within the content area; day columns keep a fixed minimum width so times stay legible.

#### Mobile
Sidebar becomes a slide-in drawer triggered from a hamburger icon in the content header (the drawer keeps the same dark background and active-item styling as desktop, just full-height and overlaying). Tables switch to stacked card rows. The weekly grid switches to a single-day view with day tabs (Mon–Sat) instead of six columns side by side.

---

## 3. Navigation

- **Main navigation (sidebar):** Dashboard, Schedule, Workload Assignment, Faculty, Subjects, Rooms, Reports — items shown are filtered by role (e.g. Faculty members see only Dashboard, Schedule, and their own Workload).
- **Header:** current page title, active academic term selector, notification icon, user menu.
- **User menu:** profile/account settings, role indicator, log out.
- **Breadcrumbs:** used only on nested detail views (e.g. Faculty → [Name] → Workload History); not shown on top-level pages.
- **Mobile navigation:** sidebar becomes a slide-in drawer opened from a header menu icon; the active page is also indicated in the header title.

---

## 4. Pages

| Page | Purpose | Access |
|---|---|---|
| Login | Authentication | Public |
| Dashboard | Department-wide overview: total faculty, workload distribution, upcoming conflicts, room utilization snapshot | Authenticated (view scoped by role) |
| Schedule | Drag-and-drop weekly schedule grid, filterable by faculty/section | Chair (edit), Faculty (view own), Academic Admin (view all) |
| Workload Assignment | Assign subjects/sections to faculty for the active term; view computed totals | Chair (edit), Academic Admin (view) |
| Faculty | Faculty roster — profiles, employment status, max load | Chair (edit), Academic Admin (view) |
| Subjects | Subject catalog — code, title, units, hours | Chair (edit), Academic Admin (view) |
| Rooms | Room list and maintenance status | Chair (edit), Academic Admin (view) |
| Reports | Workload summaries and schedule exports (Excel), per faculty or per year/section | Chair, Academic Admin |
| My Workload | A faculty member's own assigned subjects, units, and schedule | Faculty |
| Account Settings | Update own profile details, change password | All authenticated roles |

---

## 5. CRUD Behavior

All normal CRUD operations must be asynchronous.

### Create
```
Form
 ↓
Async POST
 ↓
Success
 ↓
Update UI
```
No full-page reload.

### Update
```
Edit
 ↓
Async PATCH/PUT
 ↓
Success
 ↓
Update affected UI
```
No full-page reload.

### Delete
```
Delete
 ↓
Confirmation
 ↓
Async DELETE
 ↓
Success
 ↓
Remove/update affected item
```
No full-page reload.

---

## 6. Forms

Forms must provide:

- Validation (e.g. required course code, positive unit values, end time after start time)
- Loading state while submitting
- Success feedback (toast/notification)
- Error feedback, shown inline next to the relevant field where possible
- Disabled submit button while processing, to prevent duplicate submissions
- Preservation of entered values after a validation failure — the user never has to retype a form after a failed submit

---

## 7. Tables

Tables (Faculty, Subjects, Rooms, Workload Assignment) support, where appropriate:

- Search (by name/code)
- Filtering (e.g. by employment status, by term, by section)
- Sorting (by column)
- Pagination
- Loading state
- Empty state (see Section 12)
- Error state (see Section 13)
- Row actions (edit, delete, view detail)

Updates affect the relevant table in place — adding, editing, or deleting a row updates only that table's data, without reloading the page.

---

## 8. Loading States

Every asynchronous operation provides visual feedback appropriate to its context:

- Spinner — inline actions (e.g. saving a form)
- Skeleton — initial page/table data load
- Disabled button — while a submit/save request is in flight
- Progress indicator — longer operations (e.g. generating an Excel export)

---

## 9. Notifications

Consistent toast-style notifications for:

- Success (green) — e.g. "Workload assignment saved."
- Error (red) — e.g. "Could not save — instructor already has a class at this time."
- Warning (amber) — e.g. "This room is under maintenance."
- Information (neutral/gray) — e.g. "Export started, this may take a moment."

Notifications share consistent placement, timing, and dismiss behavior across the app.

---

## 10. Modal / Drawer Behavior

Create/edit/view operations for Faculty, Subjects, and Rooms use modals. Editing a scheduled class's room/details uses a lightweight popover on the grid itself (as in the current prototype), rather than a full modal, to keep the drag-and-drop flow fast.

Opening and closing modals/drawers never reloads the page or loses the underlying page's scroll position or filters.

---

## 11. Real-Time UI

When WebSocket is used (see architecture doc, Section 6):

```
Backend Event
    ↓
Frontend Listener
    ↓
Application State
    ↓
Affected Component Updates
```

Example: the Chair moves a class on the Schedule page → connected Faculty/Academic Admin sessions viewing the same term receive the update and see the grid refresh in place, with no reload.

---

## 12. Empty States

Every data-driven page has a meaningful empty state:

- **Schedule (no classes plotted yet):** "No classes scheduled for this term yet — assign a subject to get started," with a shortcut into Workload Assignment.
- **Faculty (no faculty added):** "No faculty members yet — add the first one to begin building the roster."
- **Subjects (empty catalog):** "No subjects in the catalog yet."
- **My Workload (faculty with nothing assigned):** "You don't have any subjects assigned for this term yet."

---

## 13. Error States

Every data-driven page has a meaningful error state with a retry action where the failure is retryable (e.g. a failed data fetch shows "Couldn't load the schedule — Retry," rather than a blank page or raw error text).

---

## 14. Accessibility

- Semantic HTML (proper headings, `<table>` for tabular data, `<nav>`/`<main>`/`<button>` used correctly)
- Full keyboard navigation, including the schedule grid (keyboard-accessible alternative to drag-and-drop for placing/moving a class)
- Visible focus states on all interactive elements
- Labels on all form fields
- Appropriate ARIA attributes (e.g. `aria-live` regions for toast notifications)
- Screen-reader-friendly announcements for async state changes (saved, error, loading)
- Sufficient color contrast, including within the green/white palette
- Status is never conveyed by color alone — e.g. a room under maintenance is also labeled with text/icon, not just a colored highlight

---

## 15. Responsive Behavior

The application remains usable on desktop, tablet, and mobile. The Schedule page is the one exception with defined mobile-specific behavior (single-day view with day tabs, per Section 2) rather than a literal shrink of the six-day desktop grid.