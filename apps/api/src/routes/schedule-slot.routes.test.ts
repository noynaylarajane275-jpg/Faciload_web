/**
 * Module — ScheduleSlot API tests (real database + real HTTP stack via
 * supertest). Covers the time-boxed checklist for Part 4: clean placement,
 * overlapping faculty detected, overlapping room detected, maintenance
 * flagged, override bypass, move re-checks conflicts, and the Faculty-role
 * write block.
 *
 * Every fixture carries this suite's SLFX- marker; cleanup runs before each
 * test so the seeded dev data (term 2026-2027, rooms, subjects) is untouched.
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

const PREFIX = 'SLFX-';
const CHAIR_EMAIL = `sltst-chair-${process.pid}@faciload.local`;
const FACULTY_EMAIL = `sltst-faculty-${process.pid}@faciload.local`;
const PASSWORD = 'Test-Password-123';

let chairToken = '';
let facultyToken = '';

interface Fixtures {
  termId: string;
  roomAId: string;
  roomBId: string;
  sectionId: string;
  /** Assignment for faculty A + subject 1 (the class being dragged). */
  assignmentAId: string;
  /** A second class for the SAME faculty (subject 3) — drives faculty clashes. */
  assignmentSameFacultyId: string;
  /** A class for faculty B (subject 2) — drives room-only clashes. */
  assignmentOtherFacultyId: string;
  /** Assignment whose subject has lab_hours: 3 (partial-duration tests). */
  labAssignmentId: string;
}

async function cleanFixtures(): Promise<void> {
  await prisma.workloadAssignment.deleteMany({
    where: { faculty: { employee_no: { startsWith: PREFIX } } },
  });
  await prisma.faculty.deleteMany({
    where: { employee_no: { startsWith: PREFIX } },
  });
  await prisma.subject.deleteMany({ where: { code: { startsWith: PREFIX } } });
  await prisma.section.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.room.deleteMany({ where: { name: { startsWith: PREFIX } } });
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

/** Builds the whole fixture graph directly in the DB (faster and less brittle
 *  than exercising five other endpoints first). */
async function seedFixtures(): Promise<Fixtures> {
  const term = await prisma.academicTerm.create({
    data: { school_year: `${PREFIX}SY`, semester: 'FIRST', is_active: false },
  });
  const roomA = await prisma.room.create({ data: { name: `${PREFIX}Room A` } });
  const roomB = await prisma.room.create({ data: { name: `${PREFIX}Room B` } });
  const section = await prisma.section.create({
    data: { year_level: 1, name: `${PREFIX}1A`, size: 40 },
  });
  const facultyA = await prisma.faculty.create({
    data: { employee_no: `${PREFIX}A`, first_name: 'Ada', last_name: 'Lovelace' },
  });
  const facultyB = await prisma.faculty.create({
    data: { employee_no: `${PREFIX}B`, first_name: 'Blaise', last_name: 'Pascal' },
  });
  const subject1 = await prisma.subject.create({
    data: { code: `${PREFIX}1`, title: 'Scheduling 1', units: 3, lecture_hours: 3, lab_hours: 0 },
  });
  const subject2 = await prisma.subject.create({
    data: { code: `${PREFIX}2`, title: 'Scheduling 2', units: 3, lecture_hours: 3, lab_hours: 0 },
  });
  const subject3 = await prisma.subject.create({
    data: { code: `${PREFIX}3`, title: 'Scheduling 3', units: 3, lecture_hours: 3, lab_hours: 0 },
  });
  const subject4 = await prisma.subject.create({
    data: { code: `${PREFIX}4`, title: 'Laboratory 4', units: 2, lecture_hours: 0, lab_hours: 3 },
  });

  const assignmentA = await prisma.workloadAssignment.create({
    data: {
      faculty_id: facultyA.id,
      subject_id: subject1.id,
      section_id: section.id,
      term_id: term.id,
    },
  });
  const assignmentSameFaculty = await prisma.workloadAssignment.create({
    data: {
      faculty_id: facultyA.id,
      subject_id: subject3.id,
      section_id: section.id,
      term_id: term.id,
    },
  });
  const assignmentOtherFaculty = await prisma.workloadAssignment.create({
    data: {
      faculty_id: facultyB.id,
      subject_id: subject2.id,
      section_id: section.id,
      term_id: term.id,
    },
  });
  const assignmentLab = await prisma.workloadAssignment.create({
    data: {
      faculty_id: facultyB.id,
      subject_id: subject4.id,
      section_id: section.id,
      term_id: term.id,
    },
  });

  return {
    termId: term.id,
    roomAId: roomA.id,
    roomBId: roomB.id,
    sectionId: section.id,
    assignmentAId: assignmentA.id,
    assignmentSameFacultyId: assignmentSameFaculty.id,
    assignmentOtherFacultyId: assignmentOtherFaculty.id,
    labAssignmentId: assignmentLab.id,
  };
}

function place(
  body: { session_type: 'LECTURE' | 'LAB'; [key: string]: unknown },
  token = chairToken,
): request.Test {
  return request(createApp()).post('/api/schedule-slots').set('Authorization', `Bearer ${token}`).send(body);
}

describe('ScheduleSlot API — placement + conflict detection', () => {
  it('places a clean slot and round-trips the times exactly', async () => {
    const fixtures = await seedFixtures();
    const res = await place({
      workload_assignment_id: fixtures.assignmentAId,
      room_id: fixtures.roomAId,
      session_type: 'LECTURE',
      day_of_week: 'MON',
      start_time: '07:00',
      end_time: '09:00',
    });
    expect(res.status).toBe(201);
    expect(res.body.slot).toMatchObject({
      day_of_week: 'MON',
      start_time: '07:00',
      end_time: '09:00',
      room_name: `${PREFIX}Room A`,
      faculty_name: 'Ada Lovelace',
      subject_code: `${PREFIX}1`,
    });

    const list = await request(createApp())
      .get(`/api/schedule-slots?termId=${fixtures.termId}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].start_time).toBe('07:00');
    expect(list.body.data[0].end_time).toBe('09:00');
  });

  it('rejects a LECTURE block longer than the 2h single-meeting cap', async () => {
    const fixtures = await seedFixtures();
    const res = await place({
      workload_assignment_id: fixtures.assignmentAId,
      room_id: fixtures.roomAId,
      session_type: 'LECTURE',
      day_of_week: 'MON',
      start_time: '07:00',
      end_time: '10:00', // 3h — one lecture block holds at most 2h
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('cannot exceed 2 hours');
  });

  it('rejects a LAB block longer than the 3h single-meeting cap', async () => {
    const fixtures = await seedFixtures();
    const res = await place({
      workload_assignment_id: fixtures.labAssignmentId,
      room_id: fixtures.roomAId,
      session_type: 'LAB',
      day_of_week: 'MON',
      start_time: '09:00',
      end_time: '13:00', // 4h — one lab block holds at most 3h
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('cannot exceed 3 hours');
  });

  it('allows back-to-back blocks (touching ends are not an overlap)', async () => {
    const fixtures = await seedFixtures();
    const first = await place({
      workload_assignment_id: fixtures.assignmentAId,
      room_id: fixtures.roomAId,
      session_type: 'LECTURE',
      day_of_week: 'MON',
      start_time: '07:00',
      end_time: '09:00',
    });
    expect(first.status).toBe(201);

    const second = await place({
      workload_assignment_id: fixtures.assignmentSameFacultyId,
      room_id: fixtures.roomAId,
      session_type: 'LECTURE',
      day_of_week: 'MON',
      start_time: '09:00',
      end_time: '10:00',
    });
    expect(second.status).toBe(201);
  });

  it('rejects any placement touching the 12:00 PM – 1:00 PM lunch break', async () => {
    const fixtures = await seedFixtures();
    // Inside the window.
    const inside = await place({
      workload_assignment_id: fixtures.assignmentAId,
      room_id: fixtures.roomAId,
      session_type: 'LECTURE',
      day_of_week: 'MON',
      start_time: '12:00',
      end_time: '13:00',
    });
    expect(inside.status).toBe(400);
    expect(inside.body.error.message).toContain('Lunch break');

    // Straddling the window (starts before, ends after).
    const straddle = await place({
      workload_assignment_id: fixtures.assignmentAId,
      room_id: fixtures.roomAId,
      session_type: 'LECTURE',
      day_of_week: 'TUE',
      start_time: '11:30',
      end_time: '12:30',
    });
    expect(straddle.status).toBe(400);
    expect(straddle.body.error.message).toContain('Lunch break');

    // Adjacent blocks stay legal: ends exactly at noon, starts exactly at 1 PM.
    const before = await place({
      workload_assignment_id: fixtures.assignmentAId,
      room_id: fixtures.roomAId,
      session_type: 'LECTURE',
      day_of_week: 'WED',
      start_time: '11:00',
      end_time: '12:00',
    });
    expect(before.status).toBe(201);
    const after = await place({
      workload_assignment_id: fixtures.assignmentSameFacultyId,
      room_id: fixtures.roomBId,
      session_type: 'LECTURE',
      day_of_week: 'WED',
      start_time: '13:00',
      end_time: '14:00',
    });
    expect(after.status).toBe(201);
  });

  it('detects an overlapping faculty booking and writes nothing', async () => {
    const fixtures = await seedFixtures();
    const first = await place({
      workload_assignment_id: fixtures.assignmentAId,
      room_id: fixtures.roomAId,
      session_type: 'LECTURE',
      day_of_week: 'MON',
      start_time: '07:00',
      end_time: '09:00',
    });
    expect(first.status).toBe(201);

    // Same faculty, different room, overlapping hour → faculty conflict wins.
    const conflict = await place({
      workload_assignment_id: fixtures.assignmentSameFacultyId,
      room_id: fixtures.roomBId,
      session_type: 'LECTURE',
      day_of_week: 'MON',
      start_time: '08:30',
      end_time: '09:30',
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('FACULTY_CONFLICT');
    expect(conflict.body.error.message).toContain('Faculty conflict');
    expect(conflict.body.error.details).toMatchObject({
      day_of_week: 'MON',
      start_time: '08:30',
      end_time: '09:30',
      faculty_id: expect.any(String),
    });
    expect(conflict.body.error.details.conflicting_slots).toHaveLength(1);
    expect(conflict.body.error.details.conflicting_slots[0]).toMatchObject({
      start_time: '07:00',
      end_time: '09:00',
      subject_code: `${PREFIX}1`,
    });

    // A rejected 409 must not have created a row for that assignment.
    expect(
      await prisma.scheduleSlot.count({
        where: { workload_assignment_id: fixtures.assignmentSameFacultyId },
      }),
    ).toBe(0);
  });

  it('detects an overlapping room booking for a different faculty', async () => {
    const fixtures = await seedFixtures();
    const first = await place({
      workload_assignment_id: fixtures.assignmentAId,
      room_id: fixtures.roomAId,
      session_type: 'LECTURE',
      day_of_week: 'TUE',
      start_time: '10:00',
      end_time: '11:00',
    });
    expect(first.status).toBe(201);

    const conflict = await place({
      workload_assignment_id: fixtures.assignmentOtherFacultyId,
      room_id: fixtures.roomAId,
      session_type: 'LECTURE',
      day_of_week: 'TUE',
      start_time: '10:30',
      end_time: '11:30',
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('ROOM_CONFLICT');
    expect(conflict.body.error.details.room_name).toBe(`${PREFIX}Room A`);
    expect(conflict.body.error.details.conflicting_slots).toHaveLength(1);

    // A different day in the same room is fine.
    const otherDay = await place({
      workload_assignment_id: fixtures.assignmentOtherFacultyId,
      room_id: fixtures.roomAId,
      session_type: 'LECTURE',
      day_of_week: 'WED',
      start_time: '10:30',
      end_time: '11:30',
    });
    expect(otherDay.status).toBe(201);
  });

  it('flags a room under maintenance', async () => {
    const fixtures = await seedFixtures();
    await prisma.room.update({
      where: { id: fixtures.roomBId },
      data: { is_under_maintenance: true },
    });

    const blocked = await place({
      workload_assignment_id: fixtures.assignmentAId,
      room_id: fixtures.roomBId,
      session_type: 'LECTURE',
      day_of_week: 'THU',
      start_time: '13:00',
      end_time: '14:00',
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('ROOM_MAINTENANCE');
    expect(blocked.body.error.details.room_name).toBe(`${PREFIX}Room B`);
    expect(
      await prisma.scheduleSlot.count({
        where: { workload_assignment_id: fixtures.assignmentAId },
      }),
    ).toBe(0);

    // A room without the flag at the same time still works.
    const cleanRoom = await place({
      workload_assignment_id: fixtures.assignmentAId,
      room_id: fixtures.roomAId,
      session_type: 'LECTURE',
      day_of_week: 'THU',
      start_time: '13:00',
      end_time: '14:00',
    });
    expect(cleanRoom.status).toBe(201);
  });
});

describe('ScheduleSlot API — override, move, roles', () => {
  /** Places a 07:00–09:00 MON block for the "first" class and returns its id. */
  async function placeBaseline(fixtures: Fixtures): Promise<string> {
    const res = await place({
      workload_assignment_id: fixtures.assignmentAId,
      room_id: fixtures.roomAId,
      session_type: 'LECTURE',
      day_of_week: 'MON',
      start_time: '07:00',
      end_time: '09:00',
    });
    expect(res.status).toBe(201);
    return res.body.slot.id as string;
  }

  it('creates the conflicting slot anyway when the override is confirmed', async () => {
    const fixtures = await seedFixtures();
    await placeBaseline(fixtures);

    const conflictingBody = {
      workload_assignment_id: fixtures.assignmentSameFacultyId,
      room_id: fixtures.roomBId,
      session_type: 'LECTURE' as 'LECTURE' | 'LAB',
      day_of_week: 'MON',
      start_time: '08:00',
      end_time: '09:00',
    };
    const blocked = await place(conflictingBody);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('FACULTY_CONFLICT');

    const override = await request(createApp())
      .post(`/api/schedule-slots/${fixtures.assignmentSameFacultyId}/confirm-override`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ ...conflictingBody, override_reason: 'Approved by the Dean (test)' });

    expect(override.status).toBe(201);
    expect(override.body.slot).toMatchObject({
      day_of_week: 'MON',
      start_time: '08:00',
      end_time: '09:00',
    });
    // The override reports which conflict it bypassed (that is what gets logged).
    expect(override.body.override.applied).toBe(true);
    expect(override.body.override.conflict.code).toBe('FACULTY_CONFLICT');

    const persisted = await prisma.scheduleSlot.count({
      where: { workload_assignment_id: fixtures.assignmentSameFacultyId },
    });
    expect(persisted).toBe(1);
  });

  it('overrides a maintenance block when confirmed', async () => {
    const fixtures = await seedFixtures();
    await prisma.room.update({
      where: { id: fixtures.roomBId },
      data: { is_under_maintenance: true },
    });

    const body = {
      room_id: fixtures.roomBId,
      session_type: 'LECTURE' as 'LECTURE' | 'LAB',
      day_of_week: 'FRI',
      start_time: '15:00',
      end_time: '16:00',
    };
    const blocked = await place({ workload_assignment_id: fixtures.assignmentAId, ...body });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('ROOM_MAINTENANCE');

    const override = await request(createApp())
      .post(`/api/schedule-slots/${fixtures.assignmentAId}/confirm-override`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send(body);

    expect(override.status).toBe(201);
    expect(override.body.override.conflict.code).toBe('ROOM_MAINTENANCE');
    expect(
      await prisma.scheduleSlot.count({ where: { workload_assignment_id: fixtures.assignmentAId } }),
    ).toBe(1);
  });

  it('moves a placed block: clean move succeeds, conflicting move 409s and persists nothing', async () => {
    const fixtures = await seedFixtures();
    const baselineSlotId = await placeBaseline(fixtures);
    // A second class for a different faculty books Room A on TUE 10:00–11:00.
    const otherFaculty = await place({
      workload_assignment_id: fixtures.assignmentOtherFacultyId,
      room_id: fixtures.roomAId,
      session_type: 'LECTURE',
      day_of_week: 'TUE',
      start_time: '10:00',
      end_time: '11:00',
    });
    expect(otherFaculty.status).toBe(201);

    // Clean move: same room, different day.
    const clean = await request(createApp())
      .patch(`/api/schedule-slots/${baselineSlotId}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ day_of_week: 'WED', start_time: '07:00', end_time: '09:00' });
    expect(clean.status).toBe(200);
    expect(clean.body.slot).toMatchObject({ day_of_week: 'WED', start_time: '07:00' });

    // Conflicting move onto the other faculty's Room A booking → ROOM_CONFLICT.
    const conflicting = await request(createApp())
      .patch(`/api/schedule-slots/${baselineSlotId}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ day_of_week: 'TUE', start_time: '10:30', end_time: '11:30' });
    expect(conflicting.status).toBe(409);
    expect(conflicting.body.error.code).toBe('ROOM_CONFLICT');

    // Nothing moved: the slot is still on WED 07:00–09:00.
    const after = await prisma.scheduleSlot.findUnique({ where: { id: baselineSlotId } });
    expect(after?.day_of_week).toBe('WED');
    expect(after?.start_time).toBe('07:00');

    // Override the move (slot_id + the placement that was just rejected).
    const overrideMove = await request(createApp())
      .post(`/api/schedule-slots/${fixtures.assignmentAId}/confirm-override`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({
        slot_id: baselineSlotId,
        room_id: fixtures.roomAId,
        day_of_week: 'TUE',
        start_time: '10:30',
        end_time: '11:30',
      });
    expect(overrideMove.status).toBe(201);
    expect(overrideMove.body.slot).toMatchObject({ day_of_week: 'TUE', start_time: '10:30' });

    const moved = await prisma.scheduleSlot.findUnique({ where: { id: baselineSlotId } });
    expect(moved?.day_of_week).toBe('TUE');
  });

  it('deletes a placed block', async () => {
    const fixtures = await seedFixtures();
    const slotId = await placeBaseline(fixtures);

    const res = await request(createApp())
      .delete(`/api/schedule-slots/${slotId}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(res.status).toBe(204);
    expect(await prisma.scheduleSlot.findUnique({ where: { id: slotId } })).toBeNull();

    const again = await request(createApp())
      .delete(`/api/schedule-slots/${slotId}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(again.status).toBe(404);
  });

  it('blocks Faculty from every write path but allows reads', async () => {
    const fixtures = await seedFixtures();
    const slotId = await placeBaseline(fixtures);

    const created = await place(
      {
        workload_assignment_id: fixtures.assignmentSameFacultyId,
        room_id: fixtures.roomBId,
        session_type: 'LECTURE',
        day_of_week: 'MON',
        start_time: '13:00',
        end_time: '14:00',
      },
      facultyToken,
    );
    expect(created.status).toBe(403);

    const moved = await request(createApp())
      .patch(`/api/schedule-slots/${slotId}`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ day_of_week: 'FRI' });
    expect(moved.status).toBe(403);

    const removed = await request(createApp())
      .delete(`/api/schedule-slots/${slotId}`)
      .set('Authorization', `Bearer ${facultyToken}`);
    expect(removed.status).toBe(403);

    const overridden = await request(createApp())
      .post(`/api/schedule-slots/${fixtures.assignmentSameFacultyId}/confirm-override`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        room_id: fixtures.roomBId,
        day_of_week: 'MON',
        start_time: '13:00',
        end_time: '14:00',
      });
    expect(overridden.status).toBe(403);

    const list = await request(createApp())
      .get(`/api/schedule-slots?termId=${fixtures.termId}`)
      .set('Authorization', `Bearer ${facultyToken}`);
    expect(list.status).toBe(200);

    const anonymous = await request(createApp()).get('/api/schedule-slots');
    expect(anonymous.status).toBe(401);
  });

  it('validates the time range and unknown references', async () => {
    const fixtures = await seedFixtures();

    const badRange = await place({
      workload_assignment_id: fixtures.assignmentAId,
      room_id: fixtures.roomAId,
      session_type: 'LECTURE',
      day_of_week: 'MON',
      start_time: '10:00',
      end_time: '10:00',
    });
    expect(badRange.status).toBe(400);

    const badTimeFormat = await place({
      workload_assignment_id: fixtures.assignmentAId,
      room_id: fixtures.roomAId,
      session_type: 'LECTURE',
      day_of_week: 'MON',
      start_time: '7am',
      end_time: '09:00',
    });
    expect(badTimeFormat.status).toBe(400);

    const unknownRoom = await place({
      workload_assignment_id: fixtures.assignmentAId,
      room_id: '00000000-0000-4000-8000-000000000000',
      session_type: 'LECTURE',
      day_of_week: 'MON',
      start_time: '07:00',
      end_time: '08:00',
    });
    expect(unknownRoom.status).toBe(400);
    expect(unknownRoom.body.error.details).toMatchObject({ field: 'room_id' });

    const unknownAssignment = await place({
      workload_assignment_id: '00000000-0000-4000-8000-000000000000',
      room_id: fixtures.roomAId,
      session_type: 'LECTURE',
      day_of_week: 'MON',
      start_time: '07:00',
      end_time: '08:00',
    });
    expect(unknownAssignment.status).toBe(404);
  });
});

describe('ScheduleSlot API — partial durations (custom block sizes)', () => {
  it('places a partial 1.5h LAB block, then the remaining 1.5h separately, without exceeding the 3h budget', async () => {
    const fixtures = await seedFixtures();

    // First drag: just 1.5 of the 3 lab hours.
    const first = await place({
      workload_assignment_id: fixtures.labAssignmentId,
      room_id: fixtures.roomAId,
      session_type: 'LAB',
      day_of_week: 'MON',
      start_time: '09:00',
      end_time: '10:30',
    });
    expect(first.status).toBe(201);
    expect(first.body.slot).toMatchObject({
      session_type: 'LAB',
      start_time: '09:00',
      end_time: '10:30',
      session_hours: 1.5,
    });

    // Second drag, later the same day: the remaining 1.5 lab hours.
    const second = await place({
      workload_assignment_id: fixtures.labAssignmentId,
      room_id: fixtures.roomBId,
      session_type: 'LAB',
      day_of_week: 'MON',
      start_time: '15:00',
      end_time: '16:30',
    });
    expect(second.status).toBe(201);
    expect(second.body.slot).toMatchObject({ session_hours: 1.5 });

    // The workload-assignment read now reports the lab budget as fully used.
    const list = await request(createApp())
      .get(`/api/workload-assignments?termId=${fixtures.termId}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(list.status).toBe(200);
    const labAssignment = list.body.data.find(
      (row: { id: string }) => row.id === fixtures.labAssignmentId,
    );
    expect(labAssignment).toMatchObject({
      scheduled_lab_hours: 3,
      remaining_lab_hours: 0,
      remaining_hours: 0,
    });

    // A third 1h LAB block now exceeds the 3h budget → explicit 400.
    const overflow = await place({
      workload_assignment_id: fixtures.labAssignmentId,
      room_id: fixtures.roomAId,
      session_type: 'LAB',
      day_of_week: 'WED',
      start_time: '09:00',
      end_time: '10:00',
    });
    expect(overflow.status).toBe(400);
    expect(overflow.body.error.details).toMatchObject({
      code: 'SESSION_HOURS_OVER_CAPACITY',
      session_type: 'LAB',
      placed_hours: 3,
      requested_hours: 1,
      limit_hours: 3,
    });
  });

  it('rejects a single placement larger than the remaining session hours and writes nothing', async () => {
    const fixtures = await seedFixtures();

    const partial = await place({
      workload_assignment_id: fixtures.labAssignmentId,
      room_id: fixtures.roomAId,
      session_type: 'LAB',
      day_of_week: 'MON',
      start_time: '09:00',
      end_time: '10:30',
    });
    expect(partial.status).toBe(201);

    // 2.5h requested with only 1.5 lab hours left → rejected.
    const overflow = await place({
      workload_assignment_id: fixtures.labAssignmentId,
      room_id: fixtures.roomBId,
      session_type: 'LAB',
      day_of_week: 'MON',
      start_time: '13:00',
      end_time: '15:30',
    });
    expect(overflow.status).toBe(400);
    expect(overflow.body.error.details).toMatchObject({
      code: 'SESSION_HOURS_OVER_CAPACITY',
      session_type: 'LAB',
      placed_hours: 1.5,
      requested_hours: 2.5,
      limit_hours: 3,
    });

    // The rejected placement wrote nothing — exactly one slot exists.
    expect(
      await prisma.scheduleSlot.count({
        where: { workload_assignment_id: fixtures.labAssignmentId },
      }),
    ).toBe(1);
  });
});