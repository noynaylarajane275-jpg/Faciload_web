/**
 * Module B — Faculty API tests (apps/api/src/routes — mirrors
 * subject.routes.test.ts: real database + real HTTP stack via supertest).
 *
 * Module B specifics: linked-login delete guard (explicit confirmation flag),
 * ACTIVE-WorkloadAssignment delete guard (blocked outright with a clear 409),
 * soft-delete-only preservation of referenced faculty, and list/count
 * assertions scoped to this suite's TST-E- prefix (Step 2 decision — see the
 * pagination test for the stray '22-09333-23' row story).
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

// Test faculty use a TST-E- employee_no prefix so they never collide with
// seeded rows and every run starts from a clean slate (case-insensitive
// startsWith to also catch lowercase leftovers).
const NO_PREFIX = 'TST-E-';
const CHAIR_EMAIL = `chair-tst-${process.pid}@faciload.local`;
const FACULTY_EMAIL = `faculty-tst-${process.pid}@faciload.local`;
const PASSWORD = 'Test-Password-123';

let chairToken = '';
let facultyToken = '';

beforeEach(async () => {
  // Order matters: assignments → unlink/delete linked users → faculty rows,
  // then the FK-scenario rows (subject/section/term).
  await prisma.workloadAssignment.deleteMany({
    where: { faculty: { employee_no: { startsWith: NO_PREFIX } } },
  });
  await prisma.user.updateMany({
    where: { faculty: { employee_no: { startsWith: NO_PREFIX } } },
    data: { faculty_id: null },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: 'linked-tst-' } },
  });
  await prisma.faculty.deleteMany({
    where: { employee_no: { startsWith: NO_PREFIX } },
  });
  await prisma.subject.deleteMany({ where: { code: 'FKTST-E' } });
  await prisma.section.deleteMany({ where: { name: 'FKTST-E 1A' } });
  await prisma.academicTerm.deleteMany({ where: { school_year: 'FKTST-E-SY' } });
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

interface FacultyPayload {
  employee_no: string;
  first_name: string;
  last_name: string;
  rank?: string | null;
  employment_status?: string;
  max_units?: number;
  /** Optional opt-in login block (create only). */
  account?: { email: string; password: string };
}

async function createFaculty(
  payload: FacultyPayload,
  token = chairToken,
): Promise<request.Response> {
  return request(createApp())
    .post('/api/faculty')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

describe('POST /api/faculty', () => {
  it('creates a faculty member and returns 201 with defaults applied', async () => {
    const res = await createFaculty({
      employee_no: `${NO_PREFIX}001`,
      first_name: 'Maria',
      last_name: 'Ramos',
    });
    expect(res.status).toBe(201);
    expect(res.body.faculty).toMatchObject({
      employee_no: `${NO_PREFIX}001`,
      first_name: 'Maria',
      last_name: 'Ramos',
      rank: null,
      employment_status: 'FULL_TIME',
      max_units: 24,
      user: null,
    });
    const stored = await prisma.faculty.findUnique({
      where: { employee_no: `${NO_PREFIX}001` },
    });
    expect(stored).not.toBeNull();
    expect(stored?.deleted_at).toBeNull();
  });

  it('returns 409 for a duplicate employee_no (exact match)', async () => {
    await createFaculty({
      employee_no: `${NO_PREFIX}002`,
      first_name: 'First',
      last_name: 'Member',
    });
    const res = await createFaculty({
      employee_no: `${NO_PREFIX}002`,
      first_name: 'Second',
      last_name: 'Member',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('FACULTY_DUPLICATE_EMPLOYEE_NO');
    expect(res.body.error.details).toMatchObject({ field: 'employee_no' });
  });

  it('returns 409 for a duplicate employee_no (case-insensitive)', async () => {
    await createFaculty({
      employee_no: `${NO_PREFIX}003`,
      first_name: 'Case',
      last_name: 'Check',
    });
    const res = await createFaculty({
      employee_no: `${NO_PREFIX}003`.toLowerCase(),
      first_name: 'Case',
      last_name: 'Again',
    });
    expect(res.status).toBe(409);
  });

  it('rejects invalid values with 400', async () => {
    const zeroUnits = await createFaculty({
      employee_no: `${NO_PREFIX}004`,
      first_name: 'Zero',
      last_name: 'Units',
      max_units: 0,
    });
    expect(zeroUnits.status).toBe(400);

    const fractionalUnits = await createFaculty({
      employee_no: `${NO_PREFIX}005`,
      first_name: 'Frac',
      last_name: 'Units',
      max_units: 24.5,
    });
    expect(fractionalUnits.status).toBe(400);

    const badStatus = await createFaculty({
      employee_no: `${NO_PREFIX}006`,
      first_name: 'Bad',
      last_name: 'Status',
      employment_status: 'CONTRACT',
    });
    expect(badStatus.status).toBe(400);

    const missingNames = await createFaculty({ employee_no: `${NO_PREFIX}007`, first_name: '', last_name: '' });
    expect(missingNames.status).toBe(400);
  });

  it('returns 401 without a token', async () => {
    const res = await request(createApp()).post('/api/faculty').send({
      employee_no: `${NO_PREFIX}008`,
      first_name: 'No',
      last_name: 'Token',
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 for a FACULTY role', async () => {
    const res = await createFaculty(
      { employee_no: `${NO_PREFIX}009`, first_name: 'For', last_name: 'Bidden' },
      facultyToken,
    );
    expect(res.status).toBe(403);
  });

  it('auto-provisions a linked FACULTY login when an account block is provided', async () => {
    const accountEmail = `linked-tst-${process.pid}-ok@faciload.local`;
    const res = await createFaculty({
      employee_no: `${NO_PREFIX}100`,
      first_name: 'Account',
      last_name: 'Provisioned',
      account: { email: accountEmail, password: PASSWORD },
    });
    expect(res.status).toBe(201);
    expect(res.body.faculty.user).toMatchObject({
      email: accountEmail,
      role: 'FACULTY',
      is_active: true,
    });

    // The new login must actually work end-to-end (faculty can sign in).
    const login = await request(createApp())
      .post('/api/auth/login')
      .send({ email: accountEmail, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('FACULTY');
    expect(login.body.user.facultyId).toBe(res.body.faculty.id);
  });

  it('returns 409 when the account email is already in use', async () => {
    const accountEmail = `linked-tst-${process.pid}-dup@faciload.local`;
    await createFaculty({
      employee_no: `${NO_PREFIX}101`,
      first_name: 'First',
      last_name: 'Owner',
      account: { email: accountEmail, password: PASSWORD },
    });
    const res = await createFaculty({
      employee_no: `${NO_PREFIX}102`,
      first_name: 'Second',
      last_name: 'Owner',
      account: { email: accountEmail, password: PASSWORD },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USER_EMAIL_IN_USE');
    // The faculty row must NOT have been created (whole request rolled back).
    const stored = await prisma.faculty.findUnique({
      where: { employee_no: `${NO_PREFIX}102` },
    });
    expect(stored).toBeNull();
  });

  it('rejects a too-short account password with 400', async () => {
    const res = await createFaculty({
      employee_no: `${NO_PREFIX}103`,
      first_name: 'Short',
      last_name: 'Password',
      account: { email: `linked-tst-${process.pid}-short@faciload.local`, password: 'short' },
    });
    expect(res.status).toBe(400);
  });

  it('does not create an account when the account block is absent', async () => {
    const res = await createFaculty({
      employee_no: `${NO_PREFIX}104`,
      first_name: 'No',
      last_name: 'Account',
    });
    expect(res.status).toBe(201);
    expect(res.body.faculty.user).toBeNull();
  });
});

describe('GET /api/faculty', () => {
  it('lists faculty with pagination metadata (counts scoped to this suite prefix)', async () => {
    for (const [index, last] of ['Alpha', 'Bravo', 'Charlie'].entries()) {
      await createFaculty({
        employee_no: `${NO_PREFIX}1${index}`,
        first_name: `First${index}`,
        last_name: last,
      });
    }
    // Step 2 decision: the dev DB once contained a manually-created
    // '22-09333-23' faculty row (leftover UI smoke-test pollution — seed.ts
    // creates no faculty) that made the old UNscoped `total: 3` assertion
    // fail. The row was deleted AND the count assertions are now scoped to
    // this suite's own TST-E- prefix, so unrelated rows can never change the
    // expected totals — assertions stay relative to what this test created.
    const page = await request(createApp())
      .get(`/api/faculty?search=${NO_PREFIX}&page=1&pageSize=2`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(2);
    expect(page.body.data.map((row: { employee_no: string }) => row.employee_no)).toEqual([
      `${NO_PREFIX}10`,
      `${NO_PREFIX}11`,
    ]);
    expect(page.body.meta).toMatchObject({ total: 3, page: 1, pageSize: 2, pageCount: 2 });

    const second = await request(createApp())
      .get(`/api/faculty?search=${NO_PREFIX}&page=2&pageSize=2`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(second.status).toBe(200);
    expect(second.body.data).toHaveLength(1);
  });

  it('searches by employee_no and by name', async () => {
    await createFaculty({
      employee_no: `${NO_PREFIX}201`,
      first_name: 'Juan',
      last_name: 'Dela Cruz',
    });
    await createFaculty({
      employee_no: `${NO_PREFIX}202`,
      first_name: 'Maria',
      last_name: 'Santos',
    });

    const byNo = await request(createApp())
      .get(`/api/faculty?search=${NO_PREFIX}201`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(byNo.body.data).toHaveLength(1);
    expect(byNo.body.data[0].last_name).toBe('Dela Cruz');

    const byName = await request(createApp())
      .get('/api/faculty?search=santos')
      .set('Authorization', `Bearer ${chairToken}`);
    // The dev seed also contains a "Maria Santos", so scope the assertion to
    // this suite's own fixtures instead of asserting a global result count.
    const thisSuitesMatches = byName.body.data.filter((row: { employee_no: string }) =>
      row.employee_no.startsWith(NO_PREFIX),
    );
    expect(thisSuitesMatches).toHaveLength(1);
    expect(thisSuitesMatches[0].first_name).toBe('Maria');
  });

  it('returns 401 without a token', async () => {
    const res = await request(createApp()).get('/api/faculty');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/faculty/:id', () => {
  it('returns the faculty member with their linked login (null when absent)', async () => {
    const created = await createFaculty({
      employee_no: `${NO_PREFIX}301`,
      first_name: 'Get',
      last_name: 'Me',
    });
    const res = await request(createApp())
      .get(`/api/faculty/${created.body.faculty.id}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(res.status).toBe(200);
    expect(res.body.faculty).toMatchObject({ employee_no: `${NO_PREFIX}301`, user: null });
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(createApp())
      .get('/api/faculty/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${chairToken}`);
    expect(res.status).toBe(404);
  });

  it('returns 401 without a token', async () => {
    const res = await request(createApp()).get('/api/faculty/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/faculty/:id', () => {
  it('updates fields and returns 200', async () => {
    const created = await createFaculty({
      employee_no: `${NO_PREFIX}401`,
      first_name: 'Old',
      last_name: 'Name',
    });
    const res = await request(createApp())
      .patch(`/api/faculty/${created.body.faculty.id}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ first_name: 'New', employment_status: 'PART_TIME', max_units: 18, rank: 'Instructor I' });
    expect(res.status).toBe(200);
    expect(res.body.faculty).toMatchObject({
      first_name: 'New',
      employment_status: 'PART_TIME',
      max_units: 18,
      rank: 'Instructor I',
      employee_no: `${NO_PREFIX}401`,
    });
  });

  it('returns 409 when renaming to an employee_no used by another faculty member', async () => {
    await createFaculty({ employee_no: `${NO_PREFIX}402`, first_name: 'A', last_name: 'One' });
    const other = await createFaculty({ employee_no: `${NO_PREFIX}403`, first_name: 'B', last_name: 'Two' });
    const res = await request(createApp())
      .patch(`/api/faculty/${other.body.faculty.id}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ employee_no: `${NO_PREFIX}402` });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('FACULTY_DUPLICATE_EMPLOYEE_NO');
  });

  it('rejects invalid values with 400', async () => {
    const created = await createFaculty({
      employee_no: `${NO_PREFIX}404`,
      first_name: 'V',
      last_name: 'Case',
    });
    const res = await request(createApp())
      .patch(`/api/faculty/${created.body.faculty.id}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ max_units: -3 });
    expect(res.status).toBe(400);
  });

  it('rejects an empty body with 400', async () => {
    const created = await createFaculty({
      employee_no: `${NO_PREFIX}405`,
      first_name: 'E',
      last_name: 'Body',
    });
    const res = await request(createApp())
      .patch(`/api/faculty/${created.body.faculty.id}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 403 for a non-CHAIR role', async () => {
    const created = await createFaculty({
      employee_no: `${NO_PREFIX}406`,
      first_name: 'F',
      last_name: 'Role',
    });
    const res = await request(createApp())
      .patch(`/api/faculty/${created.body.faculty.id}`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ first_name: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(createApp())
      .patch('/api/faculty/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ first_name: 'Ghost' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/faculty/:id', () => {
  it('soft-deletes only: the row stays in the DB and disappears from reads', async () => {
    const created = await createFaculty({
      employee_no: `${NO_PREFIX}501`,
      first_name: 'Doomed',
      last_name: 'Faculty',
    });
    const id = created.body.faculty.id as string;

    const res = await request(createApp())
      .delete(`/api/faculty/${id}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(res.status).toBe(204);

    // Soft delete only — the row must persist with deleted_at set.
    const stored = await prisma.faculty.findUnique({ where: { id } });
    expect(stored).not.toBeNull();
    expect(stored?.deleted_at).not.toBeNull();

    const get = await request(createApp())
      .get(`/api/faculty/${id}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(get.status).toBe(404);

    // ...and the list endpoint excludes soft-deleted rows too.
    const list = await request(createApp())
      .get(`/api/faculty?search=${NO_PREFIX}501`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(0);
  });

  it('blocks deleting a faculty member with active WorkloadAssignment rows (409, clear message)', async () => {
    const created = await createFaculty({
      employee_no: `${NO_PREFIX}502`,
      first_name: 'Referenced',
      last_name: 'Faculty',
    });
    const facultyId = created.body.faculty.id as string;

    // Minimal ACTIVE referencing assignment — the deletion guard fires on it.
    const subject = await prisma.subject.create({
      data: { code: 'FKTST-E', title: 'FK Subject', units: 3 },
    });
    const section = await prisma.section.create({ data: { year_level: 1, name: 'FKTST-E 1A', size: 40 } });
    const term = await prisma.academicTerm.create({
      data: { school_year: 'FKTST-E-SY', semester: 'FIRST' },
    });
    const assignment = await prisma.workloadAssignment.create({
      data: { faculty_id: facultyId, subject_id: subject.id, section_id: section.id, term_id: term.id },
    });

    const res = await request(createApp())
      .delete(`/api/faculty/${facultyId}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('FACULTY_HAS_ASSIGNMENTS');
    // The exact message the frontend surfaces in the delete dialog.
    expect(res.body.error.message).toBe(
      'This faculty member has active workload assignments and cannot be removed',
    );
    expect(res.body.error.details).toMatchObject({ field: 'workloadAssignments', count: 1 });

    // The blocked attempt changed nothing: faculty still active, assignment intact.
    const storedFaculty = await prisma.faculty.findUnique({ where: { id: facultyId } });
    expect(storedFaculty).not.toBeNull();
    expect(storedFaculty?.deleted_at).toBeNull();
    const storedAssignment = await prisma.workloadAssignment.findUnique({
      where: { id: assignment.id },
    });
    expect(storedAssignment?.deleted_at).toBeNull();

    // ...and the faculty member still shows up in reads.
    const listed = await request(createApp())
      .get(`/api/faculty?search=${NO_PREFIX}502`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(listed.body.data).toHaveLength(1);
  });

  it('allows deletion once the assignments themselves are soft-deleted (guard is active-only)', async () => {
    const created = await createFaculty({
      employee_no: `${NO_PREFIX}507`,
      first_name: 'Unassigned',
      last_name: 'Soon',
    });
    const facultyId = created.body.faculty.id as string;

    const subject = await prisma.subject.create({
      data: { code: 'FKTST-E', title: 'FK Subject', units: 3 },
    });
    const section = await prisma.section.create({ data: { year_level: 1, name: 'FKTST-E 1A', size: 40 } });
    const term = await prisma.academicTerm.create({
      data: { school_year: 'FKTST-E-SY', semester: 'FIRST' },
    });
    const assignment = await prisma.workloadAssignment.create({
      data: { faculty_id: facultyId, subject_id: subject.id, section_id: section.id, term_id: term.id },
    });

    // Chair unassigns the workload first (assignment soft-deleted)...
    await prisma.workloadAssignment.update({
      where: { id: assignment.id },
      data: { deleted_at: new Date() },
    });

    // ...then the faculty delete may proceed.
    const res = await request(createApp())
      .delete(`/api/faculty/${facultyId}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(res.status).toBe(204);
    expect((await prisma.faculty.findUnique({ where: { id: facultyId } }))?.deleted_at).not.toBeNull();

    // The historical (soft-deleted) assignment row survives the removal.
    const storedAssignment = await prisma.workloadAssignment.findUnique({
      where: { id: assignment.id },
    });
    expect(storedAssignment).not.toBeNull();
  });

  it('blocks deleting a faculty member with an active login unless confirmed', async () => {
    const created = await createFaculty({
      employee_no: `${NO_PREFIX}503`,
      first_name: 'Linked',
      last_name: 'Login',
    });
    const id = created.body.faculty.id as string;
    const linkedEmail = `linked-tst-${process.pid}@faciload.local`;
    const passwordHash = await hashPassword(PASSWORD);
    await prisma.user.create({
      data: { email: linkedEmail, password_hash: passwordHash, role: 'FACULTY', faculty_id: id },
    });

    // Without confirmation → blocked with a clear, detailed conflict.
    const blocked = await request(createApp())
      .delete(`/api/faculty/${id}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('FACULTY_LINKED_USER');
    expect(blocked.body.error.message).toContain(linkedEmail);
    expect(blocked.body.error.details).toMatchObject({ field: 'confirmLinkedUser', user_email: linkedEmail });

    // Faculty + login are untouched after the blocked attempt.
    expect((await prisma.faculty.findUnique({ where: { id } }))?.deleted_at).toBeNull();
    expect((await prisma.user.findUnique({ where: { email: linkedEmail } }))?.is_active).toBe(true);

    // With explicit confirmation → allowed; login deactivated in the same transaction.
    const confirmed = await request(createApp())
      .delete(`/api/faculty/${id}?confirmLinkedUser=true`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(confirmed.status).toBe(204);

    expect((await prisma.faculty.findUnique({ where: { id } }))?.deleted_at).not.toBeNull();
    expect((await prisma.user.findUnique({ where: { email: linkedEmail } }))?.is_active).toBe(false);

    // The deactivated login can no longer sign in.
    const login = await request(createApp())
      .post('/api/auth/login')
      .send({ email: linkedEmail, password: PASSWORD });
    expect(login.status).toBe(401);
  });

  it('allows a faculty member without an active login to be deleted without confirmation', async () => {
    const created = await createFaculty({
      employee_no: `${NO_PREFIX}504`,
      first_name: 'Plain',
      last_name: 'Delete',
    });
    const res = await request(createApp())
      .delete(`/api/faculty/${created.body.faculty.id}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(res.status).toBe(204);
  });

  it('allows re-creating a soft-deleted employee_no (spec §7)', async () => {
    const created = await createFaculty({
      employee_no: `${NO_PREFIX}505`,
      first_name: 'Gone',
      last_name: 'Soon',
    });
    await request(createApp())
      .delete(`/api/faculty/${created.body.faculty.id}`)
      .set('Authorization', `Bearer ${chairToken}`);
    const res = await createFaculty({
      employee_no: `${NO_PREFIX}505`,
      first_name: 'Back',
      last_name: 'Again',
    });
    expect(res.status).toBe(201);
    expect(res.body.faculty.first_name).toBe('Back');
  });

  it('returns 403 for a non-CHAIR role', async () => {
    const created = await createFaculty({
      employee_no: `${NO_PREFIX}506`,
      first_name: 'P',
      last_name: 'Role',
    });
    const res = await request(createApp())
      .delete(`/api/faculty/${created.body.faculty.id}`)
      .set('Authorization', `Bearer ${facultyToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(createApp())
      .delete('/api/faculty/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${chairToken}`);
    expect(res.status).toBe(404);
  });
});
