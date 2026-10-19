# FACILOAD — Industrial Engineering Faculty Workload Management System

Monorepo foundation (Phase 1). Two apps plus one shared package:

- `apps/web` — React + TypeScript frontend (Vite, Tailwind CSS, React Router, Zustand).
- `apps/api` — Express + TypeScript backend (Prisma + SQLite for local dev / PostgreSQL for production, Zod validation, JWT-ready).
- `packages/shared` — shared TypeScript enums/types (`Role`, `EmploymentStatus`, `DayOfWeek`, `Semester`).

## Prerequisites

- Node.js >= 20, npm >= 10

No Docker or database server is needed for local development — the API uses a local SQLite file.

## Quickstart

1. No database server needed — local dev uses the SQLite file (`apps/api/prisma/dev.db`) that Prisma creates in step 3.

2. Configure environment:

   ```powershell
   copy .env.example .env
   copy apps\api\.env.example apps\api\.env
   ```

   | Variable | Used by | Purpose |
   |---|---|---|
   | `JWT_SECRET` | `apps/api` (Phase 2) | Signs short-lived access tokens |
   | `JWT_REFRESH_SECRET` | `apps/api` (Phase 2) | Signs long-lived refresh tokens |
   | `PORT` | `apps/api` | Port the Express server listens on (default `4000`) |
   | `CORS_ORIGIN` | `apps/api` | Allowed browser origin for CORS (Vite dev server, default `http://localhost:5173`) |
   | `VITE_API_URL` | `apps/web` | Base URL the frontend uses to reach the API (default `http://localhost:4000`) |

3. Install, migrate, seed:

   ```powershell
   npm install
   npm run migrate:dev --workspace apps/api
   npm run seed --workspace apps/api
   ```

4. Run dev servers (two terminals):

   ```powershell
   npm run dev --workspace apps/api   # http://localhost:4000/api/health
   npm run dev --workspace apps/web   # http://localhost:5173
   ```

5. Run tests:

   ```powershell
   npm run test --workspace apps/api
   npm run test --workspace apps/web
   ```

6. Inspect data: `npx prisma studio --schema prisma/schema.prisma` from `apps/api`.

## Sharing a temporary remote demo (share.bat)

To let someone view/use the running app over the internet without deploying
anything, double-click **`share.bat`** (or run it from a terminal). It:

1. Installs `cloudflared` via winget if missing (one-time, free, no account).
2. Creates and seeds the SQLite database on first run.
3. Backs up `apps/api/prisma/dev.db` to `dev.share-backup.db`, since anything
   your guest changes is written to your real local dev database.
4. Builds the web app with `VITE_API_URL=same-origin`, so the browser calls
   relative `/api/...` paths instead of `http://localhost:4000` (which would
   point at the *guest's* machine and fail).
5. Starts the API with `WEB_DIST` set, which makes it also serve the built SPA
   from the same origin — so one port, one URL, and no CORS configuration.
6. Polls `http://localhost:4000/` and **refuses to open the tunnel** if the web
   app is not being served, so you never get handed a URL that 404s.
7. Opens a Cloudflare quick tunnel and prints a public
   `https://<random>.trycloudflare.com` URL.

Send that URL to your guest, along with a login:

| Role | Email | Password |
|---|---|---|
| Chair (all features) | `chair.dev@faciload.local` | `dev-password-change-me` |
| Academic Admin (all features) | `admin.dev@faciload.local` | `dev-password-change-me` |

Notes and caveats:

- **There is no view-only role.** The only roles are `CHAIR`, `FACULTY` and
  `ACADEMIC_ADMIN` (`packages/shared/src/index.ts`); Chair and Academic Admin
  can reach every page, including all create/edit/delete screens. A guest on
  either account can modify your seeded data.
- The tunnel URL is public and unauthenticated at the edge: anyone who has it
  can log in with the dev credentials above. Close the tunnel when done
  (Ctrl+C in the `share.bat` window).
- `JWT_SECRET` is a dev placeholder. Fine for a throwaway link, never for a
  real deployment.
- `apps/web/dist` and `WEB_DIST` are only used for this sharing flow; normal
  `npm run dev` is unaffected.
