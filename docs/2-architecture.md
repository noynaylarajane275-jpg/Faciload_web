# FACILOAD — Application Architecture

> **Current implementation status (2026-09-25):** The running system is a React/Vite SPA plus an Express/TypeScript REST API backed by SQLite for local development. REST is the only current browser/API transport. Socket.IO, Redis, BullMQ, S3, and background workers are future production options, not current runtime dependencies.

## 1. Architecture Style

FACILOAD uses a modular client-server architecture:

```text
Browser (Chair / Faculty / Academic Administrator)
   |
   | HTTP(S) REST + JSON
   v
Express API (`/api`)
   |
   +---- Auth / RBAC middleware
   +---- Zod request validation
   +---- Services / business logic
   +---- Prisma repositories and SQLite database
   +---- Local avatar file storage
```

The current implementation does not include WebSocket, Redis, background workers, email, or a separate reporting service.

---

## 2. Frontend

The frontend is responsible for the weekly drag-and-drop schedule grid, read-only schedule views, client-side filters/forms/session/active-term state, async API communication, role-filtered navigation, and toast/loading/empty/error feedback. It must not access the database, contain database credentials, own authoritative business rules, or bypass backend authorization.

---

## 3. Backend

The backend is responsible for JWT authentication (login, refresh, logout), server-side RBAC, Zod validation, workload/conflict services, CRUD/query services, role-scoped dashboard and schedule views, local avatar handling, and consistent error responses. Business logic resides in service/application layers. Current UI updates use REST responses; there is no live event bus.

---

## 4. Database

The database is the authoritative persistent storage for faculty profiles, subjects, rooms, sections, terms, schedule slots, workload assignments, and user accounts. Browser storage, caches, and future real-time state must never be the only source of application data.

---

## 5. REST API

REST is used for authentication, avatar upload, CRUD, dashboard summaries, schedule views, workload data, and schedule conflict/override operations. The API is mounted under `/api`; the exact endpoint list is in `apps/api/src/routes/`.

---

## 6. Real-Time Communication

No real-time transport is currently implemented. The frontend refreshes affected data from REST responses. WebSocket or SSE support may be added later if live cross-client updates become necessary; it is not a current feature or test target.

---

## 7. Background Processing

No queue, worker, Excel export, bulk import, email, or report-generation service is currently configured. These remain future extensions. The current Reports page is a frontend placeholder only.

---

## 8. Frontend Interaction

Normal operations follow this SPA flow: user action → frontend → async REST request → backend validation/business rules → database → response → affected UI update. Ordinary CRUD avoids full-page reloads. Schedule changes are persisted through the API and conflict responses are surfaced to the user.

---

## 9. Error Handling

The frontend displays actionable errors and retry behavior. The backend returns a consistent `{ error: { code, message, details? } }` shape without exposing stack traces or query details. Database unique/foreign-key failures flow through the centralized error handler.

---

## 10. Scalability

The current single-department deployment is intentionally small: direct Node.js processes and SQLite for local development. PostgreSQL, caching, workers, and multi-instance real-time coordination may be introduced for production or measured load, but none are current runtime components.
