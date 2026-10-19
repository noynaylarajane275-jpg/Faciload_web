/**
 * Module A — Subjects routes tests (testing.md: integration tests against the
 * real database, real HTTP stack via supertest; Section 4 auth expectations).
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../config/prisma.js';
import { hashPassword } from '../services/auth.service.js';

beforeAll(() => {
  process.env.JWT_SECRET ??= 'test-access-secret';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
});

// Test subjects use a TST- code prefix so they never collide with the
// seeded catalog (IE 105, ...) and every run starts from a clean slate.
const CODE_PREFIX = 'TST-';
const CHAIR_EMAIL = `chair-tst-${process.pid}@faciload.local`;
const FACULTY_EMAIL = `faculty-tst-${process.pid}@faciload.local`;
const PASSWORD = 'Test-Password-123';

let chairToken = '';
let facultyToken = '';

beforeEach(async () => {
  // Case-insensitive so a lowercase leftover (e.g. the 'tst-501' row the
  // case-rename test leaves behind after the last test) is also removed;
  // Prisma startsWith is case-sensitive on Postgres by default.
  await prisma.subject.deleteMany({
    where: { code: { startsWith: CODE_PREFIX } },
  });
});

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD);
  await prisma.user.upsert({
    where: { email: CHAIR_EMAIL },
    update: { password_hash: passwordHash, role: 'CHAIR', is_active: true },
    create: { email: CHAIR_EMAIL, password_hash: passwordHash, role: 'CHAIR' },
  });
  await prisma.user.upsert({
    where: { email: FACULTY_EMAIL },
    update: { password_hash: passwordHash, role: 'FACULTY', is_active: true },
    create: { email: FACULTY_EMAIL, password_hash: passwordHash, role: 'FACULTY' },
  });

  // Log in through the real endpoint so the full auth stack is exercised.
  const chairLogin = await request(createApp())
    .post('/api/auth/login')
    .send({ email: CHAIR_EMAIL, password: PASSWORD });
  expect(chairLogin.status).toBe(200);
  chairToken = chairLogin.body.accessToken as string;

  const facultyLogin = await request(createApp())
    .post('/api/auth/login')
    .send({ email: FACULTY_EMAIL, password: PASSWORD });
  expect(facultyLogin.status).toBe(200);
  facultyToken = facultyLogin.body.accessToken as string;
});

interface SubjectPayload {
  code: string;
  title: string;
  units: number;
  lecture_hours?: number;
  lab_hours?: number;
}

async function createSubject(payload: SubjectPayload, token = chairToken): Promise<request.Response> {
  return request(createApp())
    .post('/api/subjects')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

describe('POST /api/subjects', () => {
  it('creates a subject and returns 201 with the stored row', async () => {
    const res = await createSubject({ code: 'TST-101', title: 'Intro to Testing', units: 3 });
    expect(res.status).toBe(201);
    expect(res.body.subject).toMatchObject({
      code: 'TST-101',
      title: 'Intro to Testing',
      units: 3,
      lecture_hours: 0,
      lab_hours: 0,
    });
    const stored = await prisma.subject.findUnique({ where: { code: 'TST-101' } });
    expect(stored).not.toBeNull();
    expect(stored?.deleted_at).toBeNull();
  });

  it('returns 409 for a duplicate code (exact match)', async () => {
    await createSubject({ code: 'TST-101', title: 'Intro to Testing', units: 3 });
    const res = await createSubject({ code: 'TST-101', title: 'Another one', units: 2 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SUBJECT_DUPLICATE_CODE');
  });

  it('returns 409 for a duplicate code (case-insensitive)', async () => {
    await createSubject({ code: 'TST-101', title: 'Intro to Testing', units: 3 });
    const res = await createSubject({ code: 'tst-101', title: 'Lowercase dup', units: 2 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SUBJECT_DUPLICATE_CODE');
  });

  it('allows re-creating the code of a soft-deleted subject (spec §7)', async () => {
    const created = await createSubject({ code: 'TST-101', title: 'To be deleted', units: 3 });
    const del = await request(createApp())
      .delete(`/api/subjects/${created.body.subject.id}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(del.status).toBe(204);

    // database-specification.md §7: soft-deleted rows are excluded from
    // active uniqueness (partial unique index), so the code is reusable.
    const res = await createSubject({ code: 'TST-101', title: 'Recreated', units: 3 });
    expect(res.status).toBe(201);
    expect(res.body.subject.title).toBe('Recreated');
  });

  it('returns 400 with field errors for an invalid payload', async () => {
    const res = await createSubject({ code: 'TST-102', title: 'Zero units', units: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fieldErrors).toHaveProperty('units');

    const missingTitle = await createSubject({ code: 'TST-103', title: '', units: 3 });
    expect(missingTitle.status).toBe(400);
    expect(missingTitle.body.error.details.fieldErrors).toHaveProperty('title');

    const negativeHours = await createSubject({
      code: 'TST-104',
      title: 'Negative hours',
      units: 3,
      lab_hours: -1,
    });
    expect(negativeHours.status).toBe(400);
    expect(negativeHours.body.error.details.fieldErrors).toHaveProperty('lab_hours');
  });

  it('rejects catalog hours above the single-meeting caps (lecture ≤ 2, lab ≤ 3)', async () => {
    // The Schedule page places one meeting per block (LEC ≤ 2h, LAB ≤ 3h), so
    // subject data entry must not admit budgets a single block can never hold.
    const overLecture = await createSubject({
      code: 'TST-105',
      title: 'Too many lecture hours',
      units: 3,
      lecture_hours: 3,
    });
    expect(overLecture.status).toBe(400);
    expect(overLecture.body.error.details.fieldErrors).toHaveProperty('lecture_hours');

    const overLab = await createSubject({
      code: 'TST-106',
      title: 'Too many lab hours',
      units: 2,
      lab_hours: 4,
    });
    expect(overLab.status).toBe(400);
    expect(overLab.body.error.details.fieldErrors).toHaveProperty('lab_hours');
  });

  it('rejects non-numeric scalars that would coerce (units: true) with 400', async () => {
    // Guards the template: Number(true) === 1 must never become a stored unit.
    const res = await request(createApp())
      .post('/api/subjects')
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ code: 'TST-107', title: 'Boolean units', units: true });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors).toHaveProperty('units');
  });

  it('returns 401 without a token', async () => {
    const res = await request(createApp())
      .post('/api/subjects')
      .send({ code: 'TST-105', title: 'No token', units: 3 });
    expect(res.status).toBe(401);
  });

  it('returns 403 when a non-CHAIR role tries to create', async () => {
    const res = await createSubject({ code: 'TST-106', title: 'Faculty attempt', units: 3 }, facultyToken);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('GET /api/subjects', () => {
  beforeEach(async () => {
    await createSubject({ code: 'TST-201', title: 'Alpha Systems', units: 3 });
    await createSubject({ code: 'TST-101', title: 'Zeta Basics', units: 2 });
    await createSubject({ code: 'TST-301', title: 'Beta Methods', units: 3, lecture_hours: 2, lab_hours: 3 });
  });

  it('returns 200 for any authenticated role', async () => {
    const res = await request(createApp())
      .get('/api/subjects')
      .set('Authorization', `Bearer ${facultyToken}`);
    expect(res.status).toBe(200);
  });

  it('returns 401 without a token', async () => {
    const res = await request(createApp()).get('/api/subjects');
    expect(res.status).toBe(401);
  });

  it('paginates and reports meta totals', async () => {
    const page1 = await request(createApp())
      .get('/api/subjects?search=TST-&page=1&pageSize=2')
      .set('Authorization', `Bearer ${chairToken}`);
    expect(page1.status).toBe(200);
    expect(page1.body.meta).toMatchObject({ total: 3, page: 1, pageSize: 2, pageCount: 2 });
    expect(page1.body.data).toHaveLength(2);

    const page2 = await request(createApp())
      .get('/api/subjects?search=TST-&page=2&pageSize=2')
      .set('Authorization', `Bearer ${chairToken}`);
    expect(page2.status).toBe(200);
    expect(page2.body.data).toHaveLength(1);
  });

  it('searches by code and title, case-insensitively', async () => {
    const byCode = await request(createApp())
      .get('/api/subjects?search=TST-101')
      .set('Authorization', `Bearer ${chairToken}`);
    expect(byCode.status).toBe(200);
    expect(byCode.body.data.map((s: { code: string }) => s.code)).toEqual(['TST-101']);

    const byTitleFragment = await request(createApp())
      .get('/api/subjects?search=alpha')
      .set('Authorization', `Bearer ${chairToken}`);
    expect(byTitleFragment.status).toBe(200);
    expect(byTitleFragment.body.data.map((s: { code: string }) => s.code)).toEqual(['TST-201']);
  });

  it('excludes soft-deleted subjects from the default list', async () => {
    const doomed = await createSubject({ code: 'TST-207', title: 'Soft deleted', units: 3 });
    const del = await request(createApp())
      .delete(`/api/subjects/${doomed.body.subject.id}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(del.status).toBe(204);

    const list = await request(createApp())
      .get('/api/subjects?search=TST-')
      .set('Authorization', `Bearer ${chairToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((s: { code: string }) => s.code)).not.toContain('TST-207');
    expect(list.body.meta.total).toBe(3);
  });

  it('sorts by title asc when requested', async () => {
    const res = await request(createApp())
      .get('/api/subjects?search=TST-&sortBy=title&sortDir=asc')
      .set('Authorization', `Bearer ${chairToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((s: { code: string }) => s.code)).toEqual([
      'TST-201', // Alpha Systems
      'TST-301', // Beta Methods
      'TST-101', // Zeta Basics
    ]);
  });

  it('returns 400 for an out-of-range page', async () => {
    const res = await request(createApp())
      .get('/api/subjects?page=0')
      .set('Authorization', `Bearer ${chairToken}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/subjects/:id', () => {
  it('returns the subject for a known id', async () => {
    const created = await createSubject({ code: 'TST-401', title: 'Findable', units: 3 });
    const res = await request(createApp())
      .get(`/api/subjects/${created.body.subject.id}`)
      .set('Authorization', `Bearer ${facultyToken}`);
    expect(res.status).toBe(200);
    expect(res.body.subject.code).toBe('TST-401');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(createApp())
      .get('/api/subjects/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${chairToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for a soft-deleted id', async () => {
    const created = await createSubject({ code: 'TST-402', title: 'Vanishing', units: 3 });
    const id = created.body.subject.id as string;
    await request(createApp())
      .delete(`/api/subjects/${id}`)
      .set('Authorization', `Bearer ${chairToken}`);
    const res = await request(createApp())
      .get(`/api/subjects/${id}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(res.status).toBe(404);
  });

  it('returns 400 for a malformed id', async () => {
    const res = await request(createApp())
      .get('/api/subjects/not-a-uuid')
      .set('Authorization', `Bearer ${chairToken}`);
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/subjects/:id', () => {
  it('updates fields and returns the updated subject', async () => {
    const created = await createSubject({ code: 'TST-501', title: 'Before', units: 3 });
    const res = await request(createApp())
      .patch(`/api/subjects/${created.body.subject.id}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ title: 'After', units: 4, lab_hours: 3 });
    expect(res.status).toBe(200);
    expect(res.body.subject).toMatchObject({ code: 'TST-501', title: 'After', units: 4, lab_hours: 3 });
  });

  it('keeps the code unchanged when PATCH omits it', async () => {
    const created = await createSubject({ code: 'TST-501', title: 'Stable', units: 3 });
    const res = await request(createApp())
      .patch(`/api/subjects/${created.body.subject.id}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ title: 'Still stable' });
    expect(res.status).toBe(200);
    expect(res.body.subject.code).toBe('TST-501');
  });

  it('rejects a code change that collides with another subject', async () => {
    await createSubject({ code: 'TST-501', title: 'Taken', units: 3 });
    const other = await createSubject({ code: 'TST-502', title: 'Renaming me', units: 3 });
    const res = await request(createApp())
      .patch(`/api/subjects/${other.body.subject.id}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ code: 'TST-501' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SUBJECT_DUPLICATE_CODE');
  });

  it('allows a case-only code rename (same subject)', async () => {
    const created = await createSubject({ code: 'TST-501', title: 'Case', units: 3 });
    const res = await request(createApp())
      .patch(`/api/subjects/${created.body.subject.id}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ code: 'tst-501' });
    expect(res.status).toBe(200);
    expect(res.body.subject.code).toBe('tst-501');
  });

  it('rejects invalid values with 400', async () => {
    const created = await createSubject({ code: 'TST-503', title: 'Invalid', units: 3 });
    const res = await request(createApp())
      .patch(`/api/subjects/${created.body.subject.id}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ units: -1 });
    expect(res.status).toBe(400);
  });

  it('rejects an empty body with 400', async () => {
    const created = await createSubject({ code: 'TST-504', title: 'Empty', units: 3 });
    const res = await request(createApp())
      .patch(`/api/subjects/${created.body.subject.id}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 403 for a non-CHAIR role', async () => {
    const created = await createSubject({ code: 'TST-505', title: 'Forbidden', units: 3 });
    const res = await request(createApp())
      .patch(`/api/subjects/${created.body.subject.id}`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ title: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(createApp())
      .patch('/api/subjects/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ title: 'Ghost' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/subjects/:id', () => {
  it('soft-deletes: row stays in DB, disappears from reads', async () => {
    const created = await createSubject({ code: 'TST-601', title: 'Doomed', units: 3 });
    const id = created.body.subject.id as string;

    const res = await request(createApp())
      .delete(`/api/subjects/${id}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(res.status).toBe(204);

    const stored = await prisma.subject.findUnique({ where: { id } });
    expect(stored).not.toBeNull();
    expect(stored?.deleted_at).not.toBeNull();

    const list = await request(createApp())
      .get('/api/subjects?search=TST-601')
      .set('Authorization', `Bearer ${chairToken}`);
    expect(list.body.data).toHaveLength(0);

    const get = await request(createApp())
      .get(`/api/subjects/${id}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(get.status).toBe(404);
  });

  it('returns 404 for an already-deleted subject', async () => {
    const created = await createSubject({ code: 'TST-602', title: 'Once', units: 3 });
    const id = created.body.subject.id as string;
    await request(createApp())
      .delete(`/api/subjects/${id}`)
      .set('Authorization', `Bearer ${chairToken}`);
    const second = await request(createApp())
      .delete(`/api/subjects/${id}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(second.status).toBe(404);
  });

  it('returns 403 for a non-CHAIR role', async () => {
    const created = await createSubject({ code: 'TST-603', title: 'Protected', units: 3 });
    const res = await request(createApp())
      .delete(`/api/subjects/${created.body.subject.id}`)
      .set('Authorization', `Bearer ${facultyToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(createApp())
      .delete('/api/subjects/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${chairToken}`);
    expect(res.status).toBe(404);
  });
});






