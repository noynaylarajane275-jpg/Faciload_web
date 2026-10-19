import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import type { NextFunction, Request, Response } from 'express';
import { healthRouter } from './routes/health.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { userRouter } from './routes/user.routes.js';
import { subjectRouter } from './routes/subject.routes.js';
import { facultyRouter } from './routes/faculty.routes.js';
import { roomRouter } from './routes/room.routes.js';
import { sectionRouter } from './routes/section.routes.js';
import { termRouter } from './routes/term.routes.js';
import { workloadAssignmentRouter } from './routes/workload-assignment.routes.js';
import { scheduleSlotRouter } from './routes/schedule-slot.routes.js';
import { scheduleViewRouter } from './routes/schedule-view.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { avatarDir } from './services/avatar.service.js';
import { notFoundHandler } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp(): express.Express {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));
  app.use(express.json());

  // Uploaded profile photos (avatar upload) are stored on disk in development
  // (tech-stack.md LOCAL storage) and served statically at /uploads/avatars/*.
  app.use(
    '/uploads/avatars',
    express.static(avatarDir(), {
      fallthrough: false,
      maxAge: '1h',
    }),
  );

  app.use('/api', healthRouter);
  app.use('/api', authRouter);
  app.use('/api', userRouter);
  app.use('/api', subjectRouter);
  app.use('/api', facultyRouter);
  app.use('/api', roomRouter);
  app.use('/api', sectionRouter);
  app.use('/api', termRouter);
  app.use('/api', workloadAssignmentRouter);
  app.use('/api', scheduleSlotRouter);
  app.use('/api', scheduleViewRouter);
  app.use('/api', dashboardRouter);

  // ---------------------------------------------------------------------------
  // Optional: serve the built SPA (apps/web/dist) from this same origin.
  //
  // This exists purely to make temporary remote demos trivial (see share.bat /
  // docs): one process on one port, so a single tunnel URL exposes the whole
  // app with no CORS setup and no second hostname to keep in sync. It is
  // inactive unless WEB_DIST points at a real build output, so `npm run dev`
  // (Vite on :5173) is completely unaffected.
  // ---------------------------------------------------------------------------
  const webDist = process.env.WEB_DIST ? path.resolve(process.env.WEB_DIST.trim()) : null;
  if (webDist && !fs.existsSync(path.join(webDist, 'index.html'))) {
    // Loud, not silent. A typo'd or space-padded WEB_DIST (easy to produce from
    // a `set VAR=... &&` chain in a .bat) otherwise leaves the API answering 404
    // on every page route, which looks like a broken tunnel rather than a
    // misconfigured path.
    // eslint-disable-next-line no-console
    console.warn(
      `[api] WEB_DIST is set to "${webDist}" but no index.html was found there - ` +
        'serving the API only (page routes will 404). Build the web app or unset WEB_DIST.',
    );
  }
  if (webDist && fs.existsSync(path.join(webDist, 'index.html'))) {
    // Hashed build assets are immutable; index.html must never be cached or a
    // later deploy would keep serving the previous bundle to returning visitors.
    app.use(
      express.static(webDist, {
        index: false,
        maxAge: '1y',
        setHeaders(res, filePath) {
          if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-store');
        },
      }),
    );
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      // Unknown /api paths must keep returning JSON 404s, not the SPA shell.
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        next();
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/** Ensure the uploads dir exists before the server starts accepting traffic. */
export function ensureUploadDirs(): void {
  fs.mkdirSync(avatarDir(), { recursive: true });
}

