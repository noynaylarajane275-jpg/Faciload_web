/**
 * Module — Schedule-view API tests (real DB + real HTTP via supertest).
 * The four read-only reshapes of ScheduleSlot data: the section view
 * ("Student Class Program"), the faculty view ("Faculty Class Program"), the
 * room view and rooms overview ("Classroom Utilization"). Covers the flat
 * row shape, section/faculty/room/term filtering, day-then-time sort order,
 * the Faculty-role self-scope (403), and unknown/malformed id handling.
 *
 * Every fixture carries this suite's VWSX- marker; cleanup runs before each
 * test so the seeded dev data (term 2026-2027, rooms, subjects) is untouched.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../config/prisma.js';
import { hashPassword } from '../services/auth.service.js';
import { parseTimeOfDay } from '../utils/time.js';

beforeAll(() => {
  process.env.JWT_SECRET ??= 'test-access-secret';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
});

const PREFIX = 'VWSX-';
const CHAIR_EMAIL = `vwstst-chair-${process.pid}@faciload.local`;
const LINKED_EMAIL = `vwstst-linked-${process.pid}@faciload.local`;
const UNLINKED_EMAIL = `vwstst-unlinked-${process.pid}@faciload.local`;
const PASSWORD = 'Test-Password-123';

let chairToken = '';
let linkedToken = '';
let unlinkedToken = '';

/** The exact wire shape every view row must have — nothing more, nothing less. */
const ROW_KEYS = [
  'color',
  'day_of_week',
  'end_time',
  'faculty_name',
  'room_name',
  'section_name',
  'start_time',
  'subject_code',
  'subject_title',
];

interface Fixtures {
  termAId: string;
  termBId: string;
  roomAId: string;
  roomBId: string;
  roomEmptyId: string;
  section1Id: string;
  section2Id: string;
  facultyAId: string;
  facultyBId: string;
}

async function cleanFixtures(): Promise<void> {
  // Unlink accounts first: user.faculty_id would otherwise restrict the
  // faculty deleteMany below.
  await prisma.user.updateMany({
    where: { email: { in: [LINKED_EMAIL, UNLINKED_EMAIL] } },
    data: { faculty_id: null },
  });
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
  await prisma.user.deleteMany({
    where: { email: { in: [CHAIR_EMAIL, LINKED_EMAIL, UNLINKED_EMAIL] } },
  });
});

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD);
  for (const [email, role] of [
    [CHAIR_EMAIL, 'CHAIR'],
    [LINKED_EMAIL, 'FACULTY'],
    [UNLINKED_EMAIL, 'FACULTY'],
  ] as const) {
    await prisma.user.upsert({
      where: { email },
      update: { password_hash: passwordHash, role, is_active: true },
      create: { email, password_hash: passwordHash, role },
    });
  }
  const app = createApp();
  const chairLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: CHAIR_EMAIL, password: PASSWORD });
  chairToken = chairLogin.body.accessToken as string;
  const unlinkedLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: UNLINKED_EMAIL, password: PASSWORD });
  unlinkedToken = unlinkedLogin.body.accessToken as string;
});

// __SEED_APPEND__

/**
 * Fixture graph covering every view dimension:
 *  - two sections, two faculty, three rooms, two terms;
 *  - facultyA teaches in BOTH sections (aggregation) while facultyB shares
 *    section1 (isolation from facultyA's view);
 *  - termB rows prove the term filter; one termB slot has NO room (TBA).
 */
async function seedFixtures(): Promise<Fixtures> {
  const termA = await prisma.academicTerm.create({
    data: { school_year: `${PREFIX}SY-A`, semester: 'FIRST', is_active: false },
  });
  const termB = await prisma.academicTerm.create({
    data: { school_year: `${PREFIX}SY-B`, semester: 'SECOND', is_active: false },
  });
  const roomA = await prisma.room.create({ data: { name: `${PREFIX}Room A` } });
  const roomB = await prisma.room.create({ data: { name: `${PREFIX}Room B` } });
  const roomEmpty = await prisma.room.create({ data: { name: `${PREFIX}Room Empty` } });
  const section1 = await prisma.section.create({ data: { year_level: 1, name: `${PREFIX}1A`, size: 40 } });
  const section2 = await prisma.section.create({ data: { year_level: 2, name: `${PREFIX}2B`, size: 40 } });
  const facultyA = await prisma.faculty.create({
    data: { employee_no: `${PREFIX}A`, first_name: 'Ada', last_name: 'Lovelace' },
  });
  const facultyB = await prisma.faculty.create({
    data: { employee_no: `${PREFIX}B`, first_name: 'Blaise', last_name: 'Pascal' },
  });
  const subject1 = await prisma.subject.create({
    data: { code: `${PREFIX}101`, title: 'Scheduling 101', units: 3, lecture_hours: 3 },
  });
  const subject2 = await prisma.subject.create({
    data: { code: `${PREFIX}102`, title: 'Scheduling 102', units: 3, lecture_hours: 3 },
  });
  const subject3 = await prisma.subject.create({
    data: { code: `${PREFIX}103`, title: 'Scheduling 103', units: 3, lecture_hours: 3 },
  });

  const assignmentA1 = await prisma.workloadAssignment.create({
    data: { faculty_id: facultyA.id, subject_id: subject1.id, section_id: section1.id, term_id: termA.id },
  });
  // A custom assignment color must ride along on every view row it backs.
  const assignmentA2 = await prisma.workloadAssignment.create({
    data: {
      faculty_id: facultyA.id,
      subject_id: subject3.id,
      section_id: section2.id,
      term_id: termA.id,
      color: '#7C3AED',
    },
  });
  const assignmentB1 = await prisma.workloadAssignment.create({
    data: { faculty_id: facultyB.id, subject_id: subject2.id, section_id: section1.id, term_id: termA.id },
  });
  const assignmentB2 = await prisma.workloadAssignment.create({
    data: { faculty_id: facultyB.id, subject_id: subject2.id, section_id: section1.id, term_id: termB.id },
  });
  const assignmentTB = await prisma.workloadAssignment.create({
    data: { faculty_id: facultyA.id, subject_id: subject1.id, section_id: section1.id, term_id: termB.id },
  });

  // Re-link the FACULTY-role account to facultyA for this fixture set and
  // mint a fresh token — the token payload carries the linked facultyId.
  await prisma.user.update({ where: { email: LINKED_EMAIL }, data: { faculty_id: facultyA.id } });
  const linkedLogin = await request(createApp())
    .post('/api/auth/login')
    .send({ email: LINKED_EMAIL, password: PASSWORD });
  linkedToken = linkedLogin.body.accessToken as string;

  const slot = (
    workload_assignment_id: string,
    room_id: string | null,
    day_of_week: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI',
    start_time: string,
    end_time: string,
    session_type: 'LECTURE' | 'LAB' = 'LECTURE',
  ): Promise<unknown> =>
    prisma.scheduleSlot.create({
      data: {
        workload_assignment_id,
        room_id,
        session_type,
        day_of_week,
        start_time: parseTimeOfDay(start_time),
        end_time: parseTimeOfDay(end_time),
      },
    });

  // section1 / termA — two faculty, two rooms.
  await slot(assignmentA1.id, roomA.id, 'MON', '07:00', '09:00');
  await slot(assignmentA1.id, roomA.id, 'WED', '09:00', '10:00');
  await slot(assignmentB1.id, roomB.id, 'MON', '10:00', '11:00');
  // section2 / termA — facultyA's other section (drives the faculty view).
  await slot(assignmentA2.id, roomB.id, 'TUE', '13:00', '15:00', 'LAB');
  // termB rows — excluded whenever termId=termA is passed.
  await slot(assignmentB2.id, roomA.id, 'FRI', '10:00', '11:00');
  await slot(assignmentTB.id, null, 'THU', '07:00', '08:00');

  return {
    termAId: termA.id,
    termBId: termB.id,
    roomAId: roomA.id,
    roomBId: roomB.id,
    roomEmptyId: roomEmpty.id,
    section1Id: section1.id,
    section2Id: section2.id,
    facultyAId: facultyA.id,
    facultyBId: facultyB.id,
  };
}

describe('Schedule-view API', () => {
  describe('GET /schedule-views/section/:sectionId (Student Class Program)', () => {
    it('returns the section slots sorted by day then time in the flat row shape', async () => {
      const f = await seedFixtures();
      const res = await request(createApp())
        .get(`/api/schedule-views/section/${f.section1Id}?termId=${f.termAId}`)
        .set('Authorization', `Bearer ${chairToken}`);
      expect(res.status).toBe(200);
      expect(res.body.section).toMatchObject({
        id: f.section1Id,
        name: `${PREFIX}1A`,
        year_level: 1,
        label: `${PREFIX}1A (Year 1)`,
      });
      expect(res.body.meta).toEqual({ total: 3 });
      for (const row of res.body.data as Record<string, unknown>[]) {
        expect(Object.keys(row).sort()).toEqual(ROW_KEYS);
      }
      expect(res.body.data).toMatchObject([
        {
          day_of_week: 'MON',
          start_time: '07:00',
          end_time: '09:00',
          subject_code: `${PREFIX}101`,
          subject_title: 'Scheduling 101',
          faculty_name: 'Ada Lovelace',
          section_name: `${PREFIX}1A (Year 1)`,
          room_name: `${PREFIX}Room A`,
        },
        {
          day_of_week: 'MON',
          start_time: '10:00',
          subject_code: `${PREFIX}102`,
          faculty_name: 'Blaise Pascal',
          room_name: `${PREFIX}Room B`,
        },
        {
          day_of_week: 'WED',
          start_time: '09:00',
          subject_code: `${PREFIX}101`,
          room_name: `${PREFIX}Room A`,
        },
      ]);
    });

    it('filters by term; without termId it returns the raw cross-term schedule', async () => {
      const f = await seedFixtures();
      const termB = await request(createApp())
        .get(`/api/schedule-views/section/${f.section1Id}?termId=${f.termBId}`)
        .set('Authorization', `Bearer ${chairToken}`);
      expect(termB.status).toBe(200);
      expect(termB.body.meta).toEqual({ total: 2 });
      expect(termB.body.data).toMatchObject([
        // The TBA slot (no room booked) still belongs to the section program.
        { day_of_week: 'THU', start_time: '07:00', subject_code: `${PREFIX}101`, room_name: null },
        { day_of_week: 'FRI', start_time: '10:00', subject_code: `${PREFIX}102`, room_name: `${PREFIX}Room A` },
      ]);

      const allTerms = await request(createApp())
        .get(`/api/schedule-views/section/${f.section1Id}`)
        .set('Authorization', `Bearer ${chairToken}`);
      expect(allTerms.status).toBe(200);
      expect(allTerms.body.meta).toEqual({ total: 5 });
    });

    it('does not leak other sections\' slots into the section program', async () => {
      const f = await seedFixtures();
      const res = await request(createApp())
        .get(`/api/schedule-views/section/${f.section2Id}?termId=${f.termAId}`)
        .set('Authorization', `Bearer ${chairToken}`);
      expect(res.status).toBe(200);
      expect(res.body.meta).toEqual({ total: 1 });
      expect(res.body.data).toMatchObject([{ day_of_week: 'TUE', subject_code: `${PREFIX}103` }]);
    });

    it('404s unknown sections and 400s malformed ids / termIds', async () => {
      const f = await seedFixtures();
      const unknown = await request(createApp())
        .get('/api/schedule-views/section/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${chairToken}`);
      expect(unknown.status).toBe(404);

      const malformed = await request(createApp())
        .get('/api/schedule-views/section/not-a-uuid')
        .set('Authorization', `Bearer ${chairToken}`);
      expect(malformed.status).toBe(400);

      const badTerm = await request(createApp())
        .get(`/api/schedule-views/section/${f.section1Id}?termId=not-a-uuid`)
        .set('Authorization', `Bearer ${chairToken}`);
      expect(badTerm.status).toBe(400);
    });
  });

  describe('GET /schedule-views/faculty/:facultyId (Faculty Class Program)', () => {
    it('aggregates one faculty member\'s slots across all their sections', async () => {
      const f = await seedFixtures();
      const res = await request(createApp())
        .get(`/api/schedule-views/faculty/${f.facultyAId}?termId=${f.termAId}`)
        .set('Authorization', `Bearer ${chairToken}`);
      expect(res.status).toBe(200);
      expect(res.body.faculty).toMatchObject({
        id: f.facultyAId,
        employee_no: `${PREFIX}A`,
        name: 'Ada Lovelace',
      });
      expect(res.body.meta).toEqual({ total: 3 });
      for (const row of res.body.data as Record<string, unknown>[]) {
        expect(Object.keys(row).sort()).toEqual(ROW_KEYS);
      }
      expect(res.body.data).toMatchObject([
        { day_of_week: 'MON', start_time: '07:00', subject_code: `${PREFIX}101`, color: null },
        // assignmentA2 carries a custom color; its rows must surface it.
        { day_of_week: 'TUE', start_time: '13:00', subject_code: `${PREFIX}103`, color: '#7C3AED' },
        { day_of_week: 'WED', start_time: '09:00', subject_code: `${PREFIX}101`, color: null },
      ]);
    });

    it('lets a FACULTY-role account view its own schedule but 403s on anyone else', async () => {
      const f = await seedFixtures();
      const own = await request(createApp())
        .get(`/api/schedule-views/faculty/${f.facultyAId}?termId=${f.termAId}`)
        .set('Authorization', `Bearer ${linkedToken}`);
      expect(own.status).toBe(200);
      expect(own.body.meta).toEqual({ total: 3 });

      const other = await request(createApp())
        .get(`/api/schedule-views/faculty/${f.facultyBId}`)
        .set('Authorization', `Bearer ${linkedToken}`);
      expect(other.status).toBe(403);
      expect(other.body.error.code).toBe('FORBIDDEN');

      // A FACULTY-role account with NO linked faculty record has no "own"
      // schedule — every faculty view is out of bounds.
      const unlinked = await request(createApp())
        .get(`/api/schedule-views/faculty/${f.facultyAId}`)
        .set('Authorization', `Bearer ${unlinkedToken}`);
      expect(unlinked.status).toBe(403);
    });

    it('lets management roles view any faculty member', async () => {
      const f = await seedFixtures();
      const res = await request(createApp())
        .get(`/api/schedule-views/faculty/${f.facultyBId}?termId=${f.termAId}`)
        .set('Authorization', `Bearer ${chairToken}`);
      expect(res.status).toBe(200);
      expect(res.body.meta).toEqual({ total: 1 });
      expect(res.body.data).toMatchObject([
        { day_of_week: 'MON', start_time: '10:00', subject_code: `${PREFIX}102` },
      ]);
    });

    it('404s unknown faculty ids and 400s malformed ones', async () => {
      await seedFixtures();
      const unknown = await request(createApp())
        .get('/api/schedule-views/faculty/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${chairToken}`);
      expect(unknown.status).toBe(404);

      const malformed = await request(createApp())
        .get('/api/schedule-views/faculty/not-a-uuid')
        .set('Authorization', `Bearer ${chairToken}`);
      expect(malformed.status).toBe(400);
    });
  });

  describe('GET /schedule-views/room/:roomId (Classroom Utilization tab)', () => {
    it('returns every slot booked into the room across sections and faculty', async () => {
      const f = await seedFixtures();
      const res = await request(createApp())
        .get(`/api/schedule-views/room/${f.roomBId}?termId=${f.termAId}`)
        .set('Authorization', `Bearer ${chairToken}`);
      expect(res.status).toBe(200);
      expect(res.body.room).toMatchObject({ id: f.roomBId, name: `${PREFIX}Room B` });
      expect(res.body.meta).toEqual({ total: 2 });
      for (const row of res.body.data as Record<string, unknown>[]) {
        expect(Object.keys(row).sort()).toEqual(ROW_KEYS);
      }
      expect(res.body.data).toMatchObject([
        { day_of_week: 'MON', start_time: '10:00', subject_code: `${PREFIX}102`, faculty_name: 'Blaise Pascal' },
        { day_of_week: 'TUE', start_time: '13:00', subject_code: `${PREFIX}103`, faculty_name: 'Ada Lovelace' },
      ]);
    });

    it('respects the term filter', async () => {
      const f = await seedFixtures();
      const res = await request(createApp())
        .get(`/api/schedule-views/room/${f.roomAId}?termId=${f.termBId}`)
        .set('Authorization', `Bearer ${chairToken}`);
      expect(res.status).toBe(200);
      expect(res.body.meta).toEqual({ total: 1 });
      expect(res.body.data).toMatchObject([{ day_of_week: 'FRI', start_time: '10:00' }]);
    });

    it('404s unknown rooms and 400s malformed ids', async () => {
      await seedFixtures();
      const unknown = await request(createApp())
        .get('/api/schedule-views/room/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${chairToken}`);
      expect(unknown.status).toBe(404);

      const malformed = await request(createApp())
        .get('/api/schedule-views/room/not-a-uuid')
        .set('Authorization', `Bearer ${chairToken}`);
      expect(malformed.status).toBe(400);
    });
  });

  describe('GET /schedule-views/rooms-overview (all utilization tabs at once)', () => {
    it('returns all rooms with their booked slots in one call', async () => {
      const f = await seedFixtures();
      const res = await request(createApp())
        .get(`/api/schedule-views/rooms-overview?termId=${f.termAId}`)
        .set('Authorization', `Bearer ${chairToken}`);
      expect(res.status).toBe(200);
      // The dev database also holds seeded rooms outside this suite's
      // fixtures — assert on the fixture rooms' entries, which keep name
      // order (A < B < Empty) within the overview.
      const fixtureIds = [f.roomAId, f.roomBId, f.roomEmptyId];
      const rooms = (
        res.body.rooms as { room_id: string; room_name: string; slots: Record<string, unknown>[] }[]
      ).filter((room) => fixtureIds.includes(room.room_id));
      expect(rooms).toMatchObject([
        {
          room_id: f.roomAId,
          room_name: `${PREFIX}Room A`,
          slots: [
            { day_of_week: 'MON', start_time: '07:00', subject_code: `${PREFIX}101` },
            { day_of_week: 'WED', start_time: '09:00', subject_code: `${PREFIX}101` },
          ],
        },
        {
          room_id: f.roomBId,
          room_name: `${PREFIX}Room B`,
          slots: [
            { day_of_week: 'MON', start_time: '10:00', subject_code: `${PREFIX}102` },
            { day_of_week: 'TUE', start_time: '13:00', subject_code: `${PREFIX}103` },
          ],
        },
        { room_id: f.roomEmptyId, room_name: `${PREFIX}Room Empty`, slots: [] },
      ]);
      for (const room of rooms) {
        for (const row of room.slots) {
          expect(Object.keys(row).sort()).toEqual(ROW_KEYS);
        }
      }
      expect(res.body.meta.total_rooms).toBe(res.body.rooms.length);
      expect(res.body.rooms.length).toBeGreaterThanOrEqual(3);
    });

    it('respects the term filter and is open to every authenticated role', async () => {
      const f = await seedFixtures();
      const termB = await request(createApp())
        .get(`/api/schedule-views/rooms-overview?termId=${f.termBId}`)
        .set('Authorization', `Bearer ${chairToken}`);
      expect(termB.status).toBe(200);
      const fixtureIds = [f.roomAId, f.roomBId, f.roomEmptyId];
      const rooms = (
        termB.body.rooms as { room_id: string; slots: Record<string, unknown>[] }[]
      ).filter((room) => fixtureIds.includes(room.room_id));
      expect(rooms).toMatchObject([
        { room_id: f.roomAId, slots: [{ day_of_week: 'FRI', start_time: '10:00' }] },
        { room_id: f.roomBId, slots: [] },
        { room_id: f.roomEmptyId, slots: [] },
      ]);

      const facultyRole = await request(createApp())
        .get(`/api/schedule-views/rooms-overview?termId=${f.termAId}`)
        .set('Authorization', `Bearer ${unlinkedToken}`);
      expect(facultyRole.status).toBe(200);
      expect(facultyRole.body.meta.total_rooms).toBe(facultyRole.body.rooms.length);
    });
  });

  it('requires authentication on every view endpoint', async () => {
    const f = await seedFixtures();
    expect((await request(createApp()).get(`/api/schedule-views/section/${f.section1Id}`)).status).toBe(401);
    expect((await request(createApp()).get(`/api/schedule-views/faculty/${f.facultyAId}`)).status).toBe(401);
    expect((await request(createApp()).get(`/api/schedule-views/room/${f.roomAId}`)).status).toBe(401);
    expect((await request(createApp()).get('/api/schedule-views/rooms-overview')).status).toBe(401);
  });
});




