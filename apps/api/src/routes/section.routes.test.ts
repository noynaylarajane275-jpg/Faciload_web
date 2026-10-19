/**
 * Module — Section API tests (real DB + real HTTP via supertest).
 * Time-boxed coverage: create, the (year_level, name) unique constraint,
 * year-level validation, list filters, delete-in-use guard, and the
 * Faculty-role write block.
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

const PREFIX = 'SCFX-';
const CHAIR_EMAIL = `sectionfx-chair-${process.pid}@faciload.local`;
const FACULTY_EMAIL = `sectionfx-faculty-${process.pid}@faciload.local`;
const PASSWORD = 'Test-Password-123';

let chairToken = '';
let facultyToken = '';

async function cleanFixtures(): Promise<void> {
  await prisma.workloadAssignment.deleteMany({
    where: { section: { name: { startsWith: PREFIX } } },
  });
  await prisma.faculty.deleteMany({
    where: { employee_no: { startsWith: PREFIX } },
  });
  await prisma.subject.deleteMany({ where: { code: { startsWith: PREFIX } } });
  await prisma.section.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.academicTerm.deleteMany({
    where: { school_year: { startsWith: PREFIX } },
  });
}

beforeEach(cleanFixtures);

// Leave no fixtures behind for other suites (or the dev database).
afterAll(async () => {
  await cleanFixtures();
  await prisma.user.deleteMany({ where: { email: { in: [CHAIR_EMAIL, FACULTY_EMAIL] } } });
});

beforeAll(async () => {
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

function createSection(yearLevel: number, name: string, token = chairToken) {
  return request(createApp())
    .post('/api/sections')
    .set('Authorization', `Bearer ${token}`)
    .send({ year_level: yearLevel, name });
}

describe('Sections API', () => {
  it('creates a section with a display label', async () => {
    const res = await createSection(3, `${PREFIX}1A`);
    expect(res.status).toBe(201);
    expect(res.body.section).toMatchObject({
      year_level: 3,
      name: `${PREFIX}1A`,
      label: `${PREFIX}1A (Year 3)`,
    });
  });

  it('rejects a duplicate (year_level, name) but allows the same name in another year', async () => {
    expect((await createSection(1, `${PREFIX}2A`)).status).toBe(201);

    const duplicate = await createSection(1, `${PREFIX}2a`);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('SECTION_DUPLICATE');

    expect((await createSection(2, `${PREFIX}2A`)).status).toBe(201);
  });

  it('validates the year level and name', async () => {
    expect((await createSection(0, `${PREFIX}Bad`)).status).toBe(400);
    expect((await createSection(7, `${PREFIX}Bad`)).status).toBe(400);
    expect((await createSection(1.5, `${PREFIX}Bad`)).status).toBe(400);
    expect((await createSection(1, '   ')).status).toBe(400);
  });

  it('lists and filters sections by year level', async () => {
    await createSection(1, `${PREFIX}A`);
    await createSection(1, `${PREFIX}B`);
    await createSection(4, `${PREFIX}C`);

    const filtered = await request(createApp())
      .get(`/api/sections?year_level=1&search=${PREFIX}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.meta.total).toBe(2);
    expect(
      filtered.body.data.every((row: { year_level: number }) => row.year_level === 1),
    ).toBe(true);
  });

  it('updates, blocks deletion while in use, then deletes when free', async () => {
    const created = await createSection(2, `${PREFIX}3A`);
    const id = created.body.section.id as string;

    const renamed = await request(createApp())
      .patch(`/api/sections/${id}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ name: `${PREFIX}3B` });
    expect(renamed.status).toBe(200);
    expect(renamed.body.section.name).toBe(`${PREFIX}3B`);

    // In-use guard: an active workload assignment referencing it blocks delete.
    const faculty = await prisma.faculty.create({
      data: { employee_no: `${PREFIX}EMP`, first_name: 'Section', last_name: 'Guard' },
    });
    const subject = await prisma.subject.create({
      data: { code: `${PREFIX}SUB`, title: 'Guard subject', units: 3 },
    });
    const term = await prisma.academicTerm.create({
      data: { school_year: `${PREFIX}SY`, semester: 'FIRST', is_active: false },
    });
    await prisma.workloadAssignment.create({
      data: { faculty_id: faculty.id, subject_id: subject.id, section_id: id, term_id: term.id },
    });

    const blocked = await request(createApp())
      .delete(`/api/sections/${id}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('SECTION_IN_USE');

    // Clean up the assignment, then delete succeeds.
    await prisma.workloadAssignment.deleteMany({ where: { section_id: id } });
    const deleted = await request(createApp())
      .delete(`/api/sections/${id}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(deleted.status).toBe(204);

    await prisma.faculty.delete({ where: { id: faculty.id } });
    await prisma.academicTerm.delete({ where: { id: term.id } });
    await prisma.subject.delete({ where: { code: `${PREFIX}SUB` } });
  });

  it('blocks Faculty from writes and anonymous reads', async () => {
    const created = await createSection(1, `${PREFIX}4A`);
    const id = created.body.section.id as string;

    expect((await createSection(1, `${PREFIX}4B`, facultyToken)).status).toBe(403);

    const facultyPatch = await request(createApp())
      .patch(`/api/sections/${id}`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ name: `${PREFIX}Nope` });
    expect(facultyPatch.status).toBe(403);

    const facultyDelete = await request(createApp())
      .delete(`/api/sections/${id}`)
      .set('Authorization', `Bearer ${facultyToken}`);
    expect(facultyDelete.status).toBe(403);

    expect((await request(createApp()).get('/api/sections')).status).toBe(401);

    // Faculty can read the list (needed for dropdowns elsewhere).
    const list = await request(createApp())
      .get('/api/sections')
      .set('Authorization', `Bearer ${facultyToken}`);
    expect(list.status).toBe(200);
  });
});