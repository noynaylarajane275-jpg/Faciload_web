/**
 * Module — the shared API client's request headers.
 *
 * Regression: `apiFetch` used to attach `Content-Type: application/json` only
 * for NON-string bodies, so every JSON POST/PATCH (all of `lib/*.ts`) went out
 * as `text/plain;charset=UTF-8` — fetch's default label for a string body.
 * `express.json()` ignores that content type, so `req.body` arrived empty and
 * the API answered 400 "Invalid request" with *every* field reported as
 * missing — the failure the Schedule grid showed when dragging a class in.
 * FormData must keep setting its own multipart boundary (avatar upload).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './api';

interface FetchCall {
  url: string;
  init: RequestInit;
}

/** Records outgoing requests; apiFetch only reads status / ok / text(). */
function stubFetch(): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    return { status: 200, ok: true, text: async () => '{}' } as unknown as Response;
  });
  return calls;
}

function contentTypeOf(call: FetchCall): string | null {
  return new Headers(call.init.headers).get('Content-Type');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch request headers', () => {
  it('labels a JSON string body as application/json', async () => {
    const calls = stubFetch();

    await apiFetch('/api/schedule-slots', {
      method: 'POST',
      body: JSON.stringify({
        workload_assignment_id: 'a1',
        session_type: 'LECTURE',
        day_of_week: 'MON',
        start_time: '07:00',
        end_time: '08:00',
      }),
    });

    expect(calls).toHaveLength(1);
    expect(contentTypeOf(calls[0])).toBe('application/json');
  });

  it('keeps the JSON default on bodiless calls (DELETE)', async () => {
    const calls = stubFetch();

    await apiFetch('/api/schedule-slots/slot-1', { method: 'DELETE' });

    expect(contentTypeOf(calls[0])).toBe('application/json');
  });

  it('leaves FormData content-type to the browser', async () => {
    const calls = stubFetch();
    const body = new FormData();
    body.append('avatar', new File(['x'], 'avatar.png', { type: 'image/png' }));

    await apiFetch('/api/users/me/avatar', { method: 'POST', body });

    expect(contentTypeOf(calls[0])).toBeNull();
  });
});
