import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../config/prisma.js';
import { hashPassword } from '../services/auth.service.js';
import { parseTimeOfDay } from '../utils/time.js';

const PREFIX = 'DSHX-';
const CHAIR_EMAIL = `dsh-chair-${process.pid}@faciload.local`;
const LINKED_EMAIL = `dsh-linked-${process.pid}@faciload.local`;
const PASSWORD = 'Test-Password-123';

let chairToken = '';
let linkedToken = '';

async function cleanAll(): Promise<void> {
  await prisma.user.updateMany({
    where: { email: { in: [LINKED_EMAIL] } },
    data: { faculty_id: null },
  });
  await prisma.scheduleSlot.deleteMany({
    where: { workload_assignment: { faculty: { employee_no: { startsWith: PREFIX } } } },
  });
  await prisma.workloadAssignment.deleteMany({
    where: { faculty: { employee_no: { startsWith: PREFIX } } },
  });
  await prisma.faculty.deleteMany({ where: { employee_no: { startsWith: PREFIX } } });
  await prisma.subject.deleteMany({ where: { code: { startsWith: PREFIX } } });
  await prisma.section.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.room.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.academicTerm.deleteMany({ where: { school_year: { startsWith: PREFIX } } });
}

beforeEach(cleanAll);

afterAll(async () => {
  await cleanAll();
  await prisma.user.deleteMany({ where: { email: { in: [CHAIR_EMAIL, LINKED_EMAIL] } } });
});

async function ensureUsers(): Promise<void> {
  process.env.JWT_SECRET ??= 'test-access-secret';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
  const passwordHash = await hashPassword(PASSWORD);
  await prisma.user.upsert({
    where: { email: CHAIR_EMAIL },
    update: { password_hash: passwordHash, role: 'CHAIR', is_active: true },
    create: { email: CHAIR_EMAIL, password_hash: passwordHash, role: 'CHAIR' },
  });
  await prisma.user.upsert({
    where: { email: LINKED_EMAIL },
    update: { password_hash: passwordHash, role: 'FACULTY', is_active: true },
    create: { email: LINKED_EMAIL, password_hash: passwordHash, role: 'FACULTY' },
  });
  const chairLogin = await request(createApp())
    .post('/api/auth/login')
    .send({ email: CHAIR_EMAIL, password: PASSWORD });
  chairToken = chairLogin.body.accessToken as string;
}
async function seedGraph(): Promise<{ t: string; r: string; m: string; a: string; b: string }> {
  const term = await prisma.academicTerm.create({
    data: { school_year: `${PREFIX}SY`, semester: 'FIRST', is_active: false },
  });
  const roomA = await prisma.room.create({ data: { name: `${PREFIX}Room A` } });
  const roomB = await prisma.room.create({ data: { name: `${PREFIX}Room B` } });
  const maint = await prisma.room.create({
    data: { name: `${PREFIX}Room Maint`, is_under_maintenance: true },
  });
  const sec1 = await prisma.section.create({ data: { year_level: 1, name: `${PREFIX}1A`, size: 40 } });
  const sec2 = await prisma.section.create({ data: { year_level: 2, name: `${PREFIX}2B`, size: 40 } });
  const facA = await prisma.faculty.create({
    data: { employee_no: `${PREFIX}A`, first_name: 'Ada', last_name: 'Lovelace', max_units: 5 },
  });
  const facB = await prisma.faculty.create({
    data: { employee_no: `${PREFIX}B`, first_name: 'Blaise', last_name: 'Pascal', max_units: 24 },
  });
  const sub1 = await prisma.subject.create({
    data: { code: `${PREFIX}101`, title: 'Load 101', units: 3, lecture_hours: 3 },
  });
  const sub2 = await prisma.subject.create({
    data: { code: `${PREFIX}102`, title: 'Load 102', units: 3, lecture_hours: 3 },
  });
  const a1 = await prisma.workloadAssignment.create({
    data: { faculty_id: facA.id, subject_id: sub1.id, section_id: sec1.id, term_id: term.id },
  });
  const a2 = await prisma.workloadAssignment.create({
    data: { faculty_id: facA.id, subject_id: sub2.id, section_id: sec2.id, term_id: term.id },
  });
  const b1 = await prisma.workloadAssignment.create({
    data: { faculty_id: facB.id, subject_id: sub2.id, section_id: sec1.id, term_id: term.id },
  });
  await prisma.workloadAssignment.create({
    data: { faculty_id: facA.id, subject_id: sub1.id, section_id: sec2.id, term_id: term.id },
  });
  await prisma.user.update({ where: { email: LINKED_EMAIL }, data: { faculty_id: facA.id } });
  const linkedLogin = await request(createApp())
    .post('/api/auth/login')
    .send({ email: LINKED_EMAIL, password: PASSWORD });
  linkedToken = linkedLogin.body.accessToken as string;
  const mk = (wid: string, rid: string, day: 'MON' | 'TUE' | 'WED', s: string, e: string): Promise<unknown> =>
    prisma.scheduleSlot.create({
      data: {
        workload_assignment_id: wid, room_id: rid, session_type: 'LECTURE', day_of_week: day,
        start_time: parseTimeOfDay(s), end_time: parseTimeOfDay(e),
      },
    });
  await mk(a1.id, roomA.id, 'MON', '07:00', '09:00');
  await mk(a1.id, roomA.id, 'WED', '09:00', '10:00');
  await mk(a2.id, roomA.id, 'TUE', '13:00', '15:00');
  await mk(b1.id, roomB.id, 'MON', '10:00', '11:00');
  return { t: term.id, r: roomA.id, m: maint.id, a: facA.id, b: facB.id };
}

describe('Dashboard summary API', () => {
  // The two tests below seed a full faculty/room/term/slot graph over real
  // HTTP + Postgres; under a loaded machine (dev servers hitting the same DB)
  // that can exceed the 5s default, so give them explicit room.
  it('chair gets live department numbers scoped to the term', async () => {
    await ensureUsers();
    const g = await seedGraph();
    const res = await request(createApp())
      .get(`/api/dashboard/summary?termId=${g.t}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(res.status).toBe(200);
    const s = res.body.summary;
    expect(s.scope).toBe('department');
    expect(s.term_id).toBe(g.t);
    expect(s.total_faculty).toBeGreaterThanOrEqual(2);
    expect(s.faculty_near_or_over_load).toMatchObject([
      {
        faculty_id: g.a, employee_no: `${PREFIX}A`, name: 'Ada Lovelace',
        scheduled_hours: 5, max_units: 5, load_ratio: 1, status: 'over',
      },
    ]);
    const ids = s.faculty_near_or_over_load.map((x: { faculty_id: string }) => x.faculty_id);
    expect(ids).not.toContain(g.b);
    expect(s.rooms_under_maintenance).toContainEqual({ id: g.m, name: `${PREFIX}Room Maint` });
    expect(s.most_booked_rooms[0]).toMatchObject({
      room_id: g.r, room_name: `${PREFIX}Room A`, booked_hours: 5, slot_count: 3,
    });
    expect(s.unscheduled_assignments_count).toBe(3);
  }, 15000);

  it('requires auth and rejects a malformed termId', async () => {
    await ensureUsers();
    expect((await request(createApp()).get('/api/dashboard/summary')).status).toBe(401);
    const bad = await request(createApp())
      .get('/api/dashboard/summary?termId=not-a-uuid')
      .set('Authorization', `Bearer ${chairToken}`);
    expect(bad.status).toBe(400);
  });

  it('faculty gets only their own summary, never another faculty data', async () => {
    await ensureUsers();
    const g = await seedGraph();
    const res = await request(createApp())
      .get(`/api/dashboard/summary?termId=${g.t}`)
      .set('Authorization', `Bearer ${linkedToken}`);
    expect(res.status).toBe(200);
    const s = res.body.summary;
    expect(s.scope).toBe('personal');
    expect(s.faculty_id).toBe(g.a);
    expect(s.my_subjects_count).toBe(2);
    expect(s.my_scheduled_hours).toBe(5);
    expect(s.my_total_hours).toBe(9);
    expect(s.load_status).toBe('over');
    expect(s.my_next_class).toMatchObject({
      day_of_week: 'MON', start_time: '07:00', subject_code: `${PREFIX}101`,
    });
    expect(s).not.toHaveProperty('total_faculty');
    expect(s).not.toHaveProperty('most_booked_rooms');
    expect(JSON.stringify(s)).not.toContain(g.b);
  }, 15000);
});


