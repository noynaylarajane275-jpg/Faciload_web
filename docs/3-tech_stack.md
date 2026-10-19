# Technology Stack

> **Current implementation status (2026-09-25):** This stack reflects dependencies and code currently in the repository. Socket.IO, Redis, BullMQ, S3/MinIO, Nginx/Docker deployment, and a dedicated Playwright E2E suite are not currently implemented; they are future/production options only.

## Frontend

- React 18 + TypeScript
- Vite
- Tailwind CSS
- React Router
- Zustand
- dnd-kit (`@dnd-kit/core` and utilities)
- Framer Motion
- Zod

## Backend

- Node.js 20+ and TypeScript
- Express 4
- Prisma 6
- Zod
- JWT via `jsonwebtoken`
- Password hashing via `bcrypt`
- CORS and local Multer-based avatar uploads

## Database

- Local development: SQLite at `apps/api/prisma/dev.db`; no Docker or database server required.
- Schema storage: SQLite-compatible `String`/`Float` equivalents for enums, UUIDs, times, and decimals, with API-layer Zod validation.
- Production target: PostgreSQL, documented but not configured in the current application.
- Migrations: Prisma Migrate; run with the API workspace scripts.

## Real-Time

**Current implementation:** None. Schedule changes are saved and rendered through REST/API state updates; open views do not currently receive live push events.

**Future option:** Socket.IO could be added for live schedule, conflict, and room-maintenance notifications. It is not a current dependency or runtime component.

## Cache / Queue

**Current implementation:** None. No Redis, BullMQ, or worker service is configured.

**Future options:** Redis, BullMQ, and Node.js workers could support caching, bulk imports, and report/export jobs when those features are introduced. The database remains the source of truth.

## Authentication

- JWT access + refresh tokens
- bcrypt password verification
- Three roles: `CHAIR`, `FACULTY`, `ACADEMIC_ADMIN`
- Access token is held in memory; refresh token is persisted in browser local storage for session restore.

## File Storage

**Current implementation:** LOCAL avatar storage. Uploads are written under the configured upload directory and served at `/uploads/avatars/*`.

**Future option:** S3-compatible storage (for example MinIO) may replace local storage for production; it is not currently implemented.

## Testing

- Unit/component tests: Vitest
- API route tests: Supertest
- Web component tests: Testing Library
- Playwright is installed as a dependency, but no maintained E2E suite/config is currently present.

## Deployment and Commands

Local development runs directly on Node.js + SQLite and does not require Docker or a database server.

```powershell
npm install
npm run migrate:dev --workspace apps/api
npm run seed --workspace apps/api
npm run dev:api
npm run dev:web
npm run build
npm run test
```

Production Docker/Nginx deployment is a future deployment plan, not a current repository feature.

## Stack summary

```text
React + TypeScript + Vite
Tailwind CSS + React Router + Zustand + dnd-kit
+
Express + TypeScript
Prisma + SQLite
Zod + JWT + bcrypt
Vitest + Supertest + Testing Library
```

Future additions may include PostgreSQL, Socket.IO, Redis/BullMQ, S3, Playwright E2E, and Docker/Nginx deployment.
