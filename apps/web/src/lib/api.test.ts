import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { resolveApiBase, apiBase } from './api';

/**
 * Tests for apps/web/src/lib/api.ts: the VITE_API_URL -> apiBase resolution that
 * share.bat depends on.
 *
 * share.bat builds the web app with VITE_API_URL=same-origin so the browser
 * issues relative /api/... requests to whichever host served the page — the
 * Cloudflare tunnel URL, which is only known at runtime. These tests lock in
 * that contract:
 *   - 'same-origin' (and '/') resolve to '' -> relative /api/... requests
 *   - unset/empty resolves to http://localhost:4000 (two-port dev setup)
 *   - an explicit URL is used as-is, trailing slash stripped
 */
describe('resolveApiBase', () => {
  it('same-origin -> empty base: browser uses relative /api/... via the tunnel host', () => {
    expect(resolveApiBase('same-origin')).toBe('');
    expect(resolveApiBase('/')).toBe('');
  });

  it('unset/empty -> localhost:4000 (normal two-port dev setup)', () => {
    expect(resolveApiBase('')).toBe('http://localhost:4000');
  });

  it('explicit URL is used as-is', () => {
    expect(resolveApiBase('https://example.com')).toBe('https://example.com');
  });

  it('trailing slash is stripped from an explicit URL', () => {
    expect(resolveApiBase('https://example.com/')).toBe('https://example.com');
    expect(resolveApiBase('http://localhost:4000///')).toBe('http://localhost:4000');
  });

  it('whitespace around the value is trimmed', () => {
    expect(resolveApiBase('  same-origin  ')).toBe('');
  });
});

describe('apiBase wiring from VITE_API_URL', () => {
  const original = process.env.VITE_API_URL;

  beforeEach(() => {
    if (original === undefined) delete process.env.VITE_API_URL;
    else process.env.VITE_API_URL = original;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.VITE_API_URL;
    else process.env.VITE_API_URL = original;
    vi.resetModules();
  });

  it('VITE_API_URL=same-origin -> apiBase is empty (relative /api/... via tunnel)', async () => {
    process.env.VITE_API_URL = 'same-origin';
    vi.resetModules();
    const mod = await import('./api');
    expect(mod.apiBase).toBe('');
  });

  it('VITE_API_URL unset -> apiBase is http://localhost:4000', async () => {
    delete process.env.VITE_API_URL;
    vi.resetModules();
    const mod = await import('./api');
    expect(mod.apiBase).toBe('http://localhost:4000');
  });
});