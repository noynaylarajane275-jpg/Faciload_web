import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../config/prisma.js';
import { hashPassword } from '../services/auth.service.js';

const PREFIX = `OFX-${process.pid}-`;
const FACULTY_EMAIL = `${PREFIX}faculty@faciload.local`;
const OTHER_FACULTY_EMAIL = `${PREFIX}other-faculty@faciload.local`;
const CHAIR_EMAIL = `${PREFIX}chair@faciload.local`;
const ADMIN_EMAIL = `${PREFIX}admin@faciload.local`;
const PASSWORD = 'Test-Password-123';

let facultyToken = '';
let otherFacultyToken = '';
let chairToken = '';
let adminToken = '';
let facultyId = '';
let otherFacultyId = '';
let termId = '';

beforeAll(async () => {
  process.env.JWT_SECRET ??= 'test-access-secret';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
  const passwordHash = await hashPassword(PASSWORD);
  const faculty = await prisma.faculty.create({
    data: {
      employee_no: `${PREFIX}EMP`,
      first_name: 'Other',
      last_name: 'Functions',
    },
  });
  facultyId = faculty.id;
  const otherFaculty = await prisma.faculty.create({
    data: {
      employee_no: `${PREFIX}OTHER`,
      first_name: 'Other',
      last_name: 'Faculty',
    },
  });
  otherFacultyId = otherFaculty.id;
  const term = await prisma.academicTerm.create({
    data: { school_year: `${PREFIX}SY`, semester: 'FIRST' },
  });
  termId = term.id;
  await prisma.user.create({
    data: {
      email: FACULTY_EMAIL,
      password_hash: passwordHash,
      role: 'FACULTY',
      faculty_id: facultyId,
    },
  });
  await prisma.user.create({
    data: {
      email: OTHER_FACULTY_EMAIL,
      password_hash: passwordHash,
      role: 'FACULTY',
      faculty_id: otherFacultyId,
    },
  });
  await prisma.user.create({
    data: { email: CHAIR_EMAIL, password_hash: passwordHash, role: 'CHAIR' },
  });
  await prisma.user.create({
    data: { email: ADMIN_EMAIL, password_hash: passwordHash, role: 'ACADEMIC_ADMIN' },
  });

  const facultyLogin = await request(createApp())
    .post('/api/auth/login')
    .send({ email: FACULTY_EMAIL, password: PASSWORD });
  expect(facultyLogin.status).toBe(200);
  facultyToken = facultyLogin.body.accessToken as string;
  const otherFacultyLogin = await request(createApp())
    .post('/api/auth/login')
    .send({ email: OTHER_FACULTY_EMAIL, password: PASSWORD });
  expect(otherFacultyLogin.status).toBe(200);
  otherFacultyToken = otherFacultyLogin.body.accessToken as string;
  const chairLogin = await request(createApp())
    .post('/api/auth/login')
    .send({ email: CHAIR_EMAIL, password: PASSWORD });
  expect(chairLogin.status).toBe(200);
  chairToken = chairLogin.body.accessToken as string;
  const adminLogin = await request(createApp())
    .post('/api/auth/login')
    .send({ email: ADMIN_EMAIL, password: PASSWORD });
  expect(adminLogin.status).toBe(200);
  adminToken = adminLogin.body.accessToken as string;
});

beforeEach(async () => {
  await prisma.designationSession.deleteMany({
    where: { designation: { faculty_id: facultyId } },
  });
  await prisma.facultyDesignation.deleteMany({
    where: { faculty_id: { in: [facultyId, otherFacultyId] } },
  });
  await prisma.otherFunctionSession.deleteMany({ where: { faculty_id: facultyId } });
  await prisma.workloadAssignment.deleteMany({ where: { faculty_id: facultyId } });
  await prisma.subject.deleteMany({ where: { code: { startsWith: PREFIX } } });
  await prisma.section.deleteMany({ where: { name: { startsWith: PREFIX } } });
});

afterAll(async () => {
  await prisma.designationSession.deleteMany({
    where: { designation: { faculty_id: { in: [facultyId, otherFacultyId] } } },
  });
  await prisma.facultyDesignation.deleteMany({
    where: { faculty_id: { in: [facultyId, otherFacultyId] } },
  });
  await prisma.otherFunctionSession.deleteMany({ where: { faculty_id: facultyId } });
  await prisma.workloadAssignment.deleteMany({ where: { faculty_id: facultyId } });
  await prisma.user.deleteMany({
    where: { email: { in: [FACULTY_EMAIL, OTHER_FACULTY_EMAIL, CHAIR_EMAIL, ADMIN_EMAIL] } },
  });
  await prisma.faculty.deleteMany({ where: { id: { in: [facultyId, otherFacultyId] } } });
  await prisma.subject.deleteMany({ where: { code: { startsWith: PREFIX } } });
  await prisma.section.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.academicTerm.deleteMany({ where: { id: termId } });
});

function createSession(
  body: Record<string, unknown>,
  token = facultyToken,
): request.Test {
  return request(createApp())
    .post('/api/other-function-sessions')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

function createDesignation(
  body: Record<string, unknown>,
  token = adminToken,
): request.Test {
  return request(createApp())
    .post('/api/faculty-designations')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

function createDesignationSession(
  body: Record<string, unknown>,
  token = facultyToken,
): request.Test {
  return request(createApp())
    .post('/api/designation-sessions')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

const VALID_SESSION = {
  term_id: '',
  function_type: 'RESEARCH',
  day_of_week: 'MON',
  start_time: '10:00',
  end_time: '11:30',
};

describe('Other Function Session API', () => {
  it('creates and lists a faculty-owned weekly session', async () => {
    const created = await createSession({ ...VALID_SESSION, term_id: termId });
    expect(created.status).toBe(201);
    expect(created.body.session).toMatchObject({
      faculty_id: facultyId,
      term_id: termId,
      function_type: 'RESEARCH',
      title: 'Research',
      day_of_week: 'MON',
      start_time: '10:00',
      end_time: '11:30',
    });

    const listed = await request(createApp())
      .get(`/api/other-function-sessions?termId=${termId}`)
      .set('Authorization', `Bearer ${facultyToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].id).toBe(created.body.session.id);
  });

  it('rejects sessions shorter than one hour', async () => {
    const response = await createSession({
      ...VALID_SESSION,
      term_id: termId,
      start_time: '10:00',
      end_time: '10:30',
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Invalid other function session');
  });

  it('rejects overlap with an existing class or other function session', async () => {
    await createSession({ ...VALID_SESSION, term_id: termId });
    const otherFunctionConflict = await createSession({
      ...VALID_SESSION,
      term_id: termId,
      function_type: 'IMP',
      start_time: '11:00',
      end_time: '12:00',
    });
    expect(otherFunctionConflict.status).toBe(409);
    expect(otherFunctionConflict.body.error.code).toBe('OTHER_FUNCTION_CONFLICT');

    const subject = await prisma.subject.create({
      data: {
        code: `${PREFIX}SUB`,
        title: 'Conflict test',
        units: 3,
      },
    });
    const section = await prisma.section.create({
      data: { year_level: 1, name: `${PREFIX}1A`, size: 40 },
    });
    const assignment = await prisma.workloadAssignment.create({
      data: {
        faculty_id: facultyId,
        subject_id: subject.id,
        section_id: section.id,
        term_id: termId,
      },
    });
    await prisma.scheduleSlot.create({
      data: {
        workload_assignment_id: assignment.id,
        session_type: 'LECTURE',
        day_of_week: 'TUE',
        start_time: '09:00',
        end_time: '11:00',
      },
    });
    const classConflict = await createSession({
      ...VALID_SESSION,
      term_id: termId,
      day_of_week: 'TUE',
    });
    expect(classConflict.status).toBe(409);
    expect(classConflict.body.error.code).toBe('OTHER_FUNCTION_CONFLICT');
  });

  it('prevents later class placements from overlapping a saved other function', async () => {
    await createSession({ ...VALID_SESSION, term_id: termId });
    const subject = await prisma.subject.create({
      data: {
        code: `${PREFIX}LATER`,
        title: 'Later placement',
        units: 3,
      },
    });
    const section = await prisma.section.create({
      data: { year_level: 1, name: `${PREFIX}2A`, size: 40 },
    });
    const assignment = await prisma.workloadAssignment.create({
      data: {
        faculty_id: facultyId,
        subject_id: subject.id,
        section_id: section.id,
        term_id: termId,
      },
    });
    const placement = await request(createApp())
      .post('/api/schedule-slots')
      .set('Authorization', `Bearer ${chairToken}`)
      .send({
        workload_assignment_id: assignment.id,
        session_type: 'LECTURE',
        day_of_week: 'MON',
        start_time: '10:30',
        end_time: '11:30',
      });

    expect(placement.status).toBe(409);
    expect(placement.body.error.code).toBe('OTHER_FUNCTION_CONFLICT');
  });

  it('allows Faculty to delete their session but blocks non-Faculty creation', async () => {
    const created = await createSession({ ...VALID_SESSION, term_id: termId });
    const forbidden = await createSession(
      { ...VALID_SESSION, term_id: termId },
      chairToken,
    );
    expect(forbidden.status).toBe(403);

    const removed = await request(createApp())
      .delete(`/api/other-function-sessions/${created.body.session.id as string}`)
      .set('Authorization', `Bearer ${facultyToken}`);
    expect(removed.status).toBe(204);
  });

  it('lets both management roles assign designations and prevents duplicates', async () => {
    const body = { faculty_id: facultyId, term_id: termId, name: 'Program Coordinator' };
    const created = await createDesignation(body);
    expect(created.status).toBe(201);
    expect(created.body.designation).toMatchObject({
      faculty_id: facultyId,
      term_id: termId,
      name: 'Program Coordinator',
      total_hours: 0,
    });

    const chairAssignment = await createDesignation({
      faculty_id: facultyId,
      term_id: termId,
      name: 'Chair Assigned',
    }, chairToken);
    expect(chairAssignment.status).toBe(201);

    const forbidden = await createDesignation(body, facultyToken);
    expect(forbidden.status).toBe(403);

    const duplicate = await createDesignation(body);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('DESIGNATION_DUPLICATE');

    const listed = await request(createApp())
      .get(`/api/faculty-designations?termId=${termId}&facultyId=${otherFacultyId}`)
      .set('Authorization', `Bearer ${facultyToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(2);
    expect(listed.body.data.map((item: { name: string }) => item.name)).toEqual([
      'Chair Assigned',
      'Program Coordinator',
    ]);
    expect(listed.body.data.every((item: { faculty_id: string }) => item.faculty_id === facultyId)).toBe(true);
  });

  it('lets Academic Admins use management endpoints that were previously Chair-only', async () => {
    const response = await request(createApp())
      .post('/api/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `${PREFIX}ADMIN`,
        title: 'Admin-created subject',
        units: 3,
      });

    expect(response.status).toBe(201);
    expect(response.body.subject).toMatchObject({
      code: `${PREFIX}ADMIN`,
      title: 'Admin-created subject',
    });
  });

  it('allows assigned Faculty to create short sessions and returns per-designation hours', async () => {
    const designation = await createDesignation({
      faculty_id: facultyId,
      term_id: termId,
      name: 'Research Lead',
    });
    const created = await createDesignationSession({
      designation_id: designation.body.designation.id,
      day_of_week: 'MON',
      start_time: '10:00',
      end_time: '10:30',
    });
    expect(created.status).toBe(201);
    expect(created.body.session).toMatchObject({
      title: 'Research Lead',
      start_time: '10:00',
      end_time: '10:30',
    });

    const otherFaculty = await prisma.facultyDesignation.create({
      data: { faculty_id: otherFacultyId, term_id: termId, name: 'Other Role' },
    });
    const forbidden = await createDesignationSession({
      designation_id: designation.body.designation.id,
      day_of_week: 'TUE',
      start_time: '10:00',
      end_time: '11:00',
    }, otherFacultyToken);
    expect(forbidden.status).toBe(404);

    const reverseForbidden = await createDesignationSession({
      designation_id: otherFaculty.id,
      day_of_week: 'TUE',
      start_time: '10:00',
      end_time: '11:00',
    });
    expect(reverseForbidden.status).toBe(404);

    const listed = await request(createApp())
      .get(`/api/faculty-designations?termId=${termId}&facultyId=${otherFacultyId}`)
      .set('Authorization', `Bearer ${facultyToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data[0]).toMatchObject({
      id: designation.body.designation.id,
      total_hours: 0.5,
    });
  });

  it('rejects designation sessions overlapping classes, other functions, or designations', async () => {
    const designation = await createDesignation({
      faculty_id: facultyId,
      term_id: termId,
      name: 'Department Lead',
    });
    const designationId = designation.body.designation.id as string;
    const subject = await prisma.subject.create({
      data: { code: `${PREFIX}CONFLICT`, title: 'Conflict test', units: 3 },
    });
    const section = await prisma.section.create({
      data: { year_level: 1, name: `${PREFIX}CONFLICT`, size: 40 },
    });
    const assignment = await prisma.workloadAssignment.create({
      data: {
        faculty_id: facultyId,
        subject_id: subject.id,
        section_id: section.id,
        term_id: termId,
      },
    });
    await prisma.scheduleSlot.create({
      data: {
        workload_assignment_id: assignment.id,
        session_type: 'LECTURE',
        day_of_week: 'MON',
        start_time: '10:00',
        end_time: '11:00',
      },
    });
    await prisma.otherFunctionSession.create({
      data: {
        faculty_id: facultyId,
        term_id: termId,
        function_type: 'RESEARCH',
        title: 'Research',
        day_of_week: 'TUE',
        start_time: '10:00',
        end_time: '11:00',
      },
    });

    const first = await createDesignationSession({
      designation_id: designationId,
      day_of_week: 'WED',
      start_time: '10:00',
      end_time: '11:00',
    });
    expect(first.status).toBe(201);

    for (const [day, start, end] of [
      ['MON', '10:30', '11:30'],
      ['TUE', '10:00', '11:00'],
      ['WED', '10:30', '11:30'],
    ]) {
      const conflict = await createDesignationSession({
        designation_id: designationId,
        day_of_week: day,
        start_time: start,
        end_time: end,
      });
      expect(conflict.status).toBe(409);
      expect(conflict.body.error.code).toBe('DESIGNATION_SESSION_CONFLICT');
    }
  });

  it('rejects later class placements that overlap a designation session', async () => {
    const designation = await createDesignation({
      faculty_id: facultyId,
      term_id: termId,
      name: 'Course Coordinator',
    });
    const saved = await createDesignationSession({
      designation_id: designation.body.designation.id,
      day_of_week: 'MON',
      start_time: '10:00',
      end_time: '11:00',
    });
    expect(saved.status).toBe(201);

    const subject = await prisma.subject.create({
      data: { code: `${PREFIX}LATER`, title: 'Later placement', units: 3 },
    });
    const section = await prisma.section.create({
      data: { year_level: 1, name: `${PREFIX}LATER`, size: 40 },
    });
    const assignment = await prisma.workloadAssignment.create({
      data: {
        faculty_id: facultyId,
        subject_id: subject.id,
        section_id: section.id,
        term_id: termId,
      },
    });
    const placement = await request(createApp())
      .post('/api/schedule-slots')
      .set('Authorization', `Bearer ${chairToken}`)
      .send({
        workload_assignment_id: assignment.id,
        session_type: 'LECTURE',
        day_of_week: 'MON',
        start_time: '10:30',
        end_time: '11:30',
      });

    expect(placement.status).toBe(409);
    expect(placement.body.error.code).toBe('DESIGNATION_SESSION_CONFLICT');
  });
});
