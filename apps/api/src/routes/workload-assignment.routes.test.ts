/**
 * Module — WorkloadAssignment API tests (real DB + real HTTP via supertest).
 * Time-boxed coverage: create with nested display data, duplicate rejection
 * (409 with the existing id), reference validation, term/faculty/section
 * filters, soft delete, and role checks.
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

const PREFIX = 'WAFX-';
const PASSWORD = 'Test-Password-123';
const CHAIR_EMAIL = `wltst-chair-${process.pid}@faciload.local`;
const FACULTY_EMAIL = `wltst-faculty-${process.pid}@faciload.local`;

let chairToken = '';
let facultyToken = '';

async function clean(): Promise<void> {
  await prisma.workloadAssignment.deleteMany({
    where: { faculty: { employee_no: { startsWith: PREFIX } } },
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

beforeEach(clean);

// Leave no fixtures behind for other suites (or the dev database).
afterAll(async () => {
  await clean();
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

interface Ids {
  termId: string;
  subjectId: string;
  otherSubjectId: string;
  sectionId: string;
  otherSectionId: string;
  facultyId: string;
  otherFacultyId: string;
}

async function seedIds(): Promise<Ids> {
  const term = await prisma.academicTerm.create({
    data: { school_year: `${PREFIX}SY`, semester: 'FIRST', is_active: false },
  });
  const subject = await prisma.subject.create({
    data: { code: `${PREFIX}101`, title: 'Workload Subject', units: 4, lecture_hours: 3, lab_hours: 3 },
  });
  const otherSubject = await prisma.subject.create({
    data: { code: `${PREFIX}102`, title: 'Second Subject', units: 3, lecture_hours: 3, lab_hours: 0 },
  });
  const section = await prisma.section.create({ data: { year_level: 2, name: `${PREFIX}1A` } });
  const otherSection = await prisma.section.create({ data: { year_level: 2, name: `${PREFIX}1B` } });
  const faculty = await prisma.faculty.create({
    data: { employee_no: `${PREFIX}1`, first_name: 'Work', last_name: 'Load' },
  });
  const otherFaculty = await prisma.faculty.create({
    data: { employee_no: `${PREFIX}2`, first_name: 'Other', last_name: 'Load' },
  });
  return {
    termId: term.id,
    subjectId: subject.id,
    otherSubjectId: otherSubject.id,
    sectionId: section.id,
    otherSectionId: otherSection.id,
    facultyId: faculty.id,
    otherFacultyId: otherFaculty.id,
  };
}

function createAssignment(body: Record<string, unknown>, token = chairToken) {
  return request(createApp())
    .post('/api/workload-assignments')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

describe('WorkloadAssignment API', () => {
  it('creates an assignment with nested display data and hour totals', async () => {
    const ids = await seedIds();
    const res = await createAssignment({
      faculty_id: ids.facultyId,
      subject_id: ids.subjectId,
      section_id: ids.sectionId,
      term_id: ids.termId,
    });

    expect(res.status).toBe(201);
    expect(res.body.assignment).toMatchObject({
      faculty_name: 'Work Load',
      subject_code: `${PREFIX}101`,
      section_label: `${PREFIX}1A (Year 2)`,
      // lecture 3 + lab 3 = 6 weekly hours, nothing placed yet. The per-type
      // budgets ride along on the DTO — the Schedule sidebar splits its
      // LECTURE/LAB cards from these fields.
      lecture_hours: 3,
      lab_hours: 3,
      weekly_hours: 6,
      scheduled_hours: 0,
      remaining_hours: 6,
      slots: [],
    });
  });

  it('rejects a duplicate with a 409 that names the existing assignment', async () => {
    const ids = await seedIds();
    const body = {
      faculty_id: ids.facultyId,
      subject_id: ids.subjectId,
      section_id: ids.sectionId,
      term_id: ids.termId,
    };
    const first = await createAssignment(body);
    expect(first.status).toBe(201);

    const duplicate = await createAssignment(body);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('WORKLOAD_ASSIGNMENT_DUPLICATE');
    expect(duplicate.body.error.message).toContain('already assigned');
    expect(duplicate.body.error.details).toMatchObject({
      field: 'faculty_id',
      existing_id: first.body.assignment.id,
    });

    const count = await prisma.workloadAssignment.count({ where: { term_id: ids.termId } });
    expect(count).toBe(1);
  });

  it('rejects unknown references with the offending field', async () => {
    const ids = await seedIds();
    const missing = await createAssignment({
      faculty_id: '00000000-0000-4000-8000-000000000000',
      subject_id: ids.subjectId,
      section_id: ids.sectionId,
      term_id: ids.termId,
    });
    expect(missing.status).toBe(400);
    expect(missing.body.error.details).toMatchObject({ field: 'faculty_id' });

    const malformed = await createAssignment({
      faculty_id: 'not-a-uuid',
      subject_id: ids.subjectId,
      section_id: ids.sectionId,
      term_id: ids.termId,
    });
    expect(malformed.status).toBe(400);
  });

  it('filters by term, faculty and section, and soft-deletes', async () => {
    const ids = await seedIds();
    const first = await createAssignment({
      faculty_id: ids.facultyId,
      subject_id: ids.subjectId,
      section_id: ids.sectionId,
      term_id: ids.termId,
    });
    const second = await createAssignment({
      faculty_id: ids.otherFacultyId,
      subject_id: ids.subjectId,
      section_id: ids.sectionId,
      term_id: ids.termId,
    });
    expect(second.status).toBe(201);

    const byTerm = await request(createApp())
      .get(`/api/workload-assignments?termId=${ids.termId}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(byTerm.body.meta.total).toBe(2);

    const byFaculty = await request(createApp())
      .get(`/api/workload-assignments?facultyId=${ids.otherFacultyId}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(byFaculty.body.meta.total).toBe(1);
    expect(byFaculty.body.data[0].faculty_id).toBe(ids.otherFacultyId);

    const bySection = await request(createApp())
      .get(`/api/workload-assignments?sectionId=${ids.sectionId}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(bySection.body.meta.total).toBe(2);

    const deleted = await request(createApp())
      .delete(`/api/workload-assignments/${first.body.assignment.id}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(deleted.status).toBe(204);

    // Soft delete: the row survives (history) but drops out of every read.
    const row = await prisma.workloadAssignment.findUnique({
      where: { id: first.body.assignment.id },
    });
    expect(row?.deleted_at).not.toBeNull();

    const afterDelete = await request(createApp())
      .get(`/api/workload-assignments?termId=${ids.termId}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(afterDelete.body.meta.total).toBe(1);
  });

  it('blocks Faculty from writes but allows reads', async () => {
    const ids = await seedIds();

    const facultyCreate = await createAssignment(
      {
        faculty_id: ids.facultyId,
        subject_id: ids.subjectId,
        section_id: ids.sectionId,
        term_id: ids.termId,
      },
      facultyToken,
    );
    expect(facultyCreate.status).toBe(403);

    expect((await request(createApp()).get('/api/workload-assignments')).status).toBe(401);

    const list = await request(createApp())
      .get(`/api/workload-assignments?termId=${ids.termId}`)
      .set('Authorization', `Bearer ${facultyToken}`);
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(0);
  });

  it('re-points subject and section via PATCH and refuses faculty/term drift', async () => {
    const ids = await seedIds();
    const created = await createAssignment({
      faculty_id: ids.facultyId,
      subject_id: ids.subjectId,
      section_id: ids.sectionId,
      term_id: ids.termId,
    });
    const id = created.body.assignment.id as string;

    const patched = await request(createApp())
      .patch(`/api/workload-assignments/${id}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ subject_id: ids.otherSubjectId, section_id: ids.otherSectionId });

    expect(patched.status).toBe(200);
    expect(patched.body.assignment).toMatchObject({
      id,
      faculty_id: ids.facultyId,
      term_id: ids.termId,
      subject_id: ids.otherSubjectId,
      section_id: ids.otherSectionId,
      subject_code: `${PREFIX}102`,
      section_label: `${PREFIX}1B (Year 2)`,
    });

    // Faculty / term are deliberately not writable (identity drift) — the
    // strict schema rejects them instead of silently ignoring the change.
    const drifted = await request(createApp())
      .patch(`/api/workload-assignments/${id}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ faculty_id: ids.otherFacultyId });
    expect(drifted.status).toBe(400);

    const empty = await request(createApp())
      .patch(`/api/workload-assignments/${id}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({});
    expect(empty.status).toBe(400);

    const forbidden = await request(createApp())
      .patch(`/api/workload-assignments/${id}`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ subject_id: ids.subjectId });
    expect(forbidden.status).toBe(403);

    // Re-pointing onto an existing (faculty, subject, section, term) is a 409.
    const second = await createAssignment({
      faculty_id: ids.facultyId,
      subject_id: ids.otherSubjectId,
      section_id: ids.sectionId,
      term_id: ids.termId,
    });
    expect(second.status).toBe(201);
    const collision = await request(createApp())
      .patch(`/api/workload-assignments/${second.body.assignment.id}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ section_id: ids.otherSectionId });
    expect(collision.status).toBe(409);
    expect(collision.body.error.code).toBe('WORKLOAD_ASSIGNMENT_DUPLICATE');
  });

  it('404s a PATCH for an unknown assignment id', async () => {
    const res = await request(createApp())
      .patch('/api/workload-assignments/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ color: '#2FBF71' });
    expect(res.status).toBe(404);
  });

  it('blocks deleting an assignment that already has scheduled slots', async () => {
    const ids = await seedIds();
    const created = await createAssignment({
      faculty_id: ids.facultyId,
      subject_id: ids.subjectId,
      section_id: ids.sectionId,
      term_id: ids.termId,
    });
    const id = created.body.assignment.id as string;

    await prisma.scheduleSlot.create({
      data: {
        workload_assignment_id: id,
        session_type: 'LECTURE',
        day_of_week: 'MON',
        start_time: '07:00',
        end_time: '08:30',
      },
    });

    const blocked = await request(createApp())
      .delete(`/api/workload-assignments/${id}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('WORKLOAD_ASSIGNMENT_HAS_SLOTS');
    expect(blocked.body.error.message).toBe(
      'This assignment has scheduled classes — remove those from the Schedule first',
    );
    expect(blocked.body.error.details).toMatchObject({ count: 1 });

    // The guard must not soft-delete as a side effect.
    const row = await prisma.workloadAssignment.findUnique({ where: { id } });
    expect(row?.deleted_at).toBeNull();

    // Clearing the plotted slots releases the guard.
    await prisma.scheduleSlot.deleteMany({ where: { workload_assignment_id: id } });
    const allowed = await request(createApp())
      .delete(`/api/workload-assignments/${id}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(allowed.status).toBe(204);
    const afterDelete = await prisma.workloadAssignment.findUnique({ where: { id } });
    expect(afterDelete?.deleted_at).not.toBeNull();
  });

  it('paginates the list and matches the search term across related rows', async () => {
    const ids = await seedIds();
    const bodies = [
      { faculty_id: ids.facultyId, subject_id: ids.subjectId, section_id: ids.sectionId },
      { faculty_id: ids.otherFacultyId, subject_id: ids.subjectId, section_id: ids.sectionId },
      { faculty_id: ids.facultyId, subject_id: ids.otherSubjectId, section_id: ids.otherSectionId },
    ];
    for (const body of bodies) {
      const res = await createAssignment({ ...body, term_id: ids.termId });
      expect(res.status).toBe(201);
    }

    const page1 = await request(createApp())
      .get(`/api/workload-assignments?termId=${ids.termId}&page=1&pageSize=2`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta).toMatchObject({ total: 3, page: 1, pageSize: 2, pageCount: 2 });

    const page2 = await request(createApp())
      .get(`/api/workload-assignments?termId=${ids.termId}&page=2&pageSize=2`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.meta.page).toBe(2);

    // Search matches the related subject/faculty/section rows, not just ids.
    const bySubject = await request(createApp())
      .get(`/api/workload-assignments?termId=${ids.termId}&search=${PREFIX}102`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(bySubject.body.meta.total).toBe(1);
    expect(bySubject.body.data[0].subject_code).toBe(`${PREFIX}102`);

    const bySection = await request(createApp())
      .get(`/api/workload-assignments?termId=${ids.termId}&search=${PREFIX}1B`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(bySection.body.meta.total).toBe(1);

    // Out-of-range params are rejected, not silently clamped.
    const bad = await request(createApp())
      .get(`/api/workload-assignments?page=0&pageSize=500`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(bad.status).toBe(400);
  });
});