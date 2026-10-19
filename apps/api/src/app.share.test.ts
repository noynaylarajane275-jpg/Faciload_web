import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Tests for the share.bat flow: the API must serve the built SPA from a single
 * origin (WEB_DIST) so a Cloudflare quick tunnel exposes the whole app on one
 * URL with no CORS setup.
 *
 * These tests lock in the preconditions under which share.bat prints a public
 * link:
 *   - GET / returns 200 with the SPA shell (share.bat's readiness poll)
 *   - /api/* routes keep answering JSON (health, no SPA shell for API calls)
 *   - client-side routes fall back to index.html (SPA routing through the tunnel)
 *   - with WEB_DIST unset or pointing at a missing build, nothing is served
 *     (API-only dev mode is untouched)
 */
describe('share.bat flow — WEB_DIST single-origin serving', () => {
  const originalWebDist = process.env.WEB_DIST;
  let distDir: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    if (originalWebDist === undefined) delete process.env.WEB_DIST;
    else process.env.WEB_DIST = originalWebDist;
    distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'faciload-share-'));
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    if (originalWebDist === undefined) delete process.env.WEB_DIST;
    else process.env.WEB_DIST = originalWebDist;
    fs.rmSync(distDir, { recursive: true, force: true });
  });

  function buildApp(hasIndex = true): ReturnType<typeof createApp> {
    if (hasIndex) {
      fs.writeFileSync(path.join(distDir, 'index.html'), '<html><body>share shell</body></html>');
    }
    process.env.WEB_DIST = distDir;
    return createApp();
  }

  describe('when WEB_DIST points at a real build output (share.bat normal path)', () => {
    it('GET / returns 200 with the SPA shell — share.bat readiness poll passes', async () => {
      const res = await request(buildApp()).get('/');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('share shell');
    });

    it('/api routes still answer JSON on the same origin', async () => {
      const res = await request(buildApp()).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('client-side routes fall back to index.html (SPA routing through tunnel)', async () => {
      const res = await request(buildApp()).get('/dashboard/schedule');
      expect(res.status).toBe(200);
      expect(res.text).toContain('share shell');
    });

    it('unknown /api routes keep returning JSON 404, not the SPA shell', async () => {
      const res = await request(buildApp()).get('/api/does-not-exist');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
    });

    it('does not warn when WEB_DIST is valid', () => {
      buildApp();
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('when WEB_DIST is unset (normal npm run dev, two-port setup)', () => {
    it('GET / returns 404 — SPA serving is inactive, Vite dev server is unaffected', async () => {
      delete process.env.WEB_DIST;
      const res = await request(createApp()).get('/');
      expect(res.status).toBe(404);
    });
  });

  describe('when WEB_DIST points at a missing or incomplete build', () => {
    it('logs a loud warning and serves the API only (no silent broken tunnel)', async () => {
      process.env.WEB_DIST = path.join(distDir, 'does-not-exist');
      const app = createApp();
      const res = await request(app).get('/');
      expect(res.status).toBe(404);
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toContain('WEB_DIST');
      expect(warnSpy.mock.calls[0][0]).toContain('index.html');
    });

    it('warns when the build dir exists but has no index.html', async () => {
      // distDir intentionally left without index.html
      process.env.WEB_DIST = distDir;
      const app = createApp();
      const res = await request(app).get('/');
      expect(res.status).toBe(404);
      expect(warnSpy).toHaveBeenCalled();
    });
  });
});