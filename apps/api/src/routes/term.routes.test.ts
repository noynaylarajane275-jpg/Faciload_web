/**
 * Module — AcademicTerm API tests (real DB + real HTTP via supertest).
 * Time-boxed coverage: create, unique (school_year, semester), school-year
 * format, the "only one active term at a time" invariant, and role checks.
 *
 * NOTE: this suite temporarily activates its own term, which necessarily
 * deactivates whatever term was active before (that IS the invariant). The
 * previously active term is restored in afterAll so a developer's local
 * seeded term is left exactly as it was found.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../config/prisma.js';
import { hashPassword } from '../services/auth.service.js';

beforeAll(() => {
  process.env.JWT_SECRET ??= 'test-access-secret';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
});

/**
 * School years must match the API's "YYYY-YYYY" format, so the term fixtures
 * use far-future years instead of a prefix — isolated from the seeded
 * 2026-2027 term and from every other suite's `*FX-SY` placeholder years.
 */
const TEST_YEAR = '2999-3000';
const TEST_YEAR_2 = '3000-3001';
const TEST_YEAR_3 = '3001-3002';
const TEST_YEARS = [TEST_YEAR, TEST_YEAR_2, TEST_YEAR_3];

const CHAIR_EMAIL = `termfx-chair-${process.pid}@faciload.local`;
const FACULTY_EMAIL = `termfx-faculty-${process.pid}@faciload.local`;
const PASSWORD = 'Test-Password-123';

let chairToken = '';
let facultyToken = '';
let previouslyActiveTermId: string | null = null;

async function cleanTerms(): Promise<void> {
  await prisma.workloadAssignment.deleteMany({
    where: { term: { school_year: { in: TEST_YEARS } } },
  });
  await prisma.academicTerm.deleteMany({ where: { school_year: { in: TEST_YEARS } } });
}

beforeEach(cleanTerms);

beforeAll(async () => {
  const previous = await prisma.academicTerm.findFirst({ where: { is_active: true } });
  previouslyActiveTermId = previous?.id ?? null;

  const passwordHash = await hashPassword(PASSWORD);
  for (const [email, role] of [
    [CHAIR_EMAIL, 'CHAIR'],
    [FACULTY_EMAIL, 'FACULTY'],
  ] as const) {
    await prisma.user.upsert({
      where: { email },
      update: { password_hash: passwordHash, role, is_active: true },
      create: { email, password_hash: passwordHash, role },
    });
  }
  const chair = await request(createApp())
    .post('/api/auth/login')
    .send({ email: CHAIR_EMAIL, password: PASSWORD });
  chairToken = chair.body.accessToken as string;
  const faculty = await request(createApp())
    .post('/api/auth/login')
    .send({ email: FACULTY_EMAIL, password: PASSWORD });
  facultyToken = faculty.body.accessToken as string;
});

afterAll(async () => {
  await cleanTerms();
  // Put the developer's seeded active term back the way we found it.
  if (previouslyActiveTermId) {
    await prisma.academicTerm.updateMany({
      where: { id: previouslyActiveTermId },
      data: { is_active: true },
    });
  }
  await prisma.user.deleteMany({ where: { email: { in: [CHAIR_EMAIL, FACULTY_EMAIL] } } });
});

function createTerm(body: Record<string, unknown>, token = chairToken) {
  return request(createApp())
    .post('/api/terms')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

describe('AcademicTerm API', () => {
  it('creates a term (inactive by default) with a display label', async () => {
    const res = await createTerm({ school_year: TEST_YEAR, semester: 'SECOND' });
    expect(res.status).toBe(201);
    expect(res.body.term).toMatchObject({
      school_year: TEST_YEAR,
      semester: 'SECOND',
      is_active: false,
      label: `${TEST_YEAR} — 2nd Sem`,
    });
  });

  it('validates the school year and semester', async () => {
    expect((await createTerm({ school_year: '2026', semester: 'FIRST' })).status).toBe(400);
    expect((await createTerm({ school_year: TEST_YEAR, semester: 'WINTER' })).status).toBe(400);
  });

  it('rejects a duplicate (school_year, semester) with a 409', async () => {
    await createTerm({ school_year: TEST_YEAR, semester: 'FIRST' });
    const duplicate = await createTerm({ school_year: TEST_YEAR, semester: 'FIRST' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('TERM_DUPLICATE');
  });

  it('keeps exactly one active term: activating one deactivates the other', async () => {
    const first = await createTerm({
      school_year: TEST_YEAR,
      semester: 'FIRST',
      is_active: true,
    });
    expect(first.body.term.is_active).toBe(true);

    const second = await createTerm({
      school_year: TEST_YEAR,
      semester: 'SECOND',
    });
    expect(second.body.term.is_active).toBe(false);

    // Activate the second via PATCH — the first must flip off in the same write.
    const activated = await request(createApp())
      .patch(`/api/terms/${second.body.term.id}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ is_active: true });
    expect(activated.status).toBe(200);
    expect(activated.body.term.is_active).toBe(true);

    const stillActive = await prisma.academicTerm.findMany({ where: { is_active: true } });
    expect(stillActive).toHaveLength(1);
    expect(stillActive[0]?.id).toBe(second.body.term.id);

    // /terms/active is the single-place source for the header selector.
    const active = await request(createApp())
      .get('/api/terms/active')
      .set('Authorization', `Bearer ${chairToken}`);
    expect(active.status).toBe(200);
    expect(active.body.term.id).toBe(second.body.term.id);

    // And GET /api/terms lists them newest school year first.
    const list = await request(createApp())
      .get('/api/terms')
      .set('Authorization', `Bearer ${chairToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('blocks Faculty from writes but allows reads', async () => {
    const created = await createTerm({ school_year: TEST_YEAR_2, semester: 'SUMMER' });

    expect((await createTerm({ school_year: TEST_YEAR_3, semester: 'FIRST' }, facultyToken)).status).toBe(
      403,
    );

    const facultyPatch = await request(createApp())
      .patch(`/api/terms/${created.body.term.id}`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ is_active: true });
    expect(facultyPatch.status).toBe(403);

    expect((await request(createApp()).get('/api/terms')).status).toBe(401);

    const list = await request(createApp())
      .get('/api/terms')
      .set('Authorization', `Bearer ${facultyToken}`);
    expect(list.status).toBe(200);
  });
});