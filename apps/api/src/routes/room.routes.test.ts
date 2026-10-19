/**
 * Module — Rooms API tests (apps/api/src/routes, mirrors
 * subject.routes.test.ts / faculty.routes.test.ts: real database + real HTTP
 * stack via supertest).
 *
 * Deliberately small (time-boxed): create, duplicate-name rejection,
 * the single-field maintenance toggle, and the Faculty-role write block.
 * Every fixture is prefixed with this suite's RMFX- marker so runs never
 * collide with seeded rooms.
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

const PREFIX = 'RMFX-';
const CHAIR_EMAIL = `room-chair-tst-${process.pid}@faciload.local`;
const FACULTY_EMAIL = `room-faculty-tst-${process.pid}@faciload.local`;
const PASSWORD = 'Test-Password-123';

let chairToken = '';
let facultyToken = '';

beforeEach(async () => {
  await prisma.room.deleteMany({ where: { name: { startsWith: PREFIX } } });
});

// Leave no fixtures behind: a leftover row here would leak into other suites'
// unfiltered list assertions (and into the developer's local data).
afterAll(async () => {
  await prisma.room.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { in: [CHAIR_EMAIL, FACULTY_EMAIL] } } });
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

function createRoom(name: string, token = chairToken) {
  return request(createApp()).post('/api/rooms').set('Authorization', `Bearer ${token}`).send({ name });
}

describe('Rooms API', () => {
  it('creates a room with a default (off) maintenance flag', async () => {
    const res = await createRoom(`${PREFIX}Lab A`);
    expect(res.status).toBe(201);
    expect(res.body.room).toMatchObject({ name: `${PREFIX}Lab A`, is_under_maintenance: false });
    expect(res.body.room.id).toBeTruthy();
  });

  it('rejects a duplicate name with a 409 (case-insensitive) and writes nothing', async () => {
    await createRoom(`${PREFIX}Lab B`);
    const duplicate = await createRoom(`${PREFIX}lab b`);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('ROOM_DUPLICATE_NAME');
    expect(duplicate.body.error.details).toMatchObject({ field: 'name' });

    const count = await prisma.room.count({
      where: { name: { startsWith: PREFIX } },
    });
    expect(count).toBe(1);
  });

  it('toggles maintenance with a single-field PATCH and back again', async () => {
    const created = await createRoom(`${PREFIX}Lab C`);
    const id = created.body.room.id as string;

    const on = await request(createApp())
      .patch(`/api/rooms/${id}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ is_under_maintenance: true });
    expect(on.status).toBe(200);
    expect(on.body.room.is_under_maintenance).toBe(true);
    // The toggle body never carries the name, so the other columns are intact.
    expect(on.body.room.name).toBe(`${PREFIX}Lab C`);

    const off = await request(createApp())
      .patch(`/api/rooms/${id}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ is_under_maintenance: false });
    expect(off.status).toBe(200);
    expect(off.body.room.is_under_maintenance).toBe(false);
  });

  it('rejects a rename that collides with another room', async () => {
    await createRoom(`${PREFIX}Lab D`);
    const other = await createRoom(`${PREFIX}Lab E`);
    const res = await request(createApp())
      .patch(`/api/rooms/${other.body.room.id}`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ name: `${PREFIX}Lab D` });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ROOM_DUPLICATE_NAME');
  });

  it('lists rooms and filters by name', async () => {
    await createRoom(`${PREFIX}Alpha Hall`);
    await createRoom(`${PREFIX}Beta Hall`);

    // Scoped by the suite prefix: the DB also holds seeded rooms (IE Lab 1…)
    // that this suite must not assert on.
    const all = await request(createApp())
      .get(`/api/rooms?search=${PREFIX}`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(all.status).toBe(200);
    expect(all.body.meta.total).toBe(2);

    const filtered = await request(createApp())
      .get('/api/rooms?search=alpha')
      .set('Authorization', `Bearer ${chairToken}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0].name).toBe(`${PREFIX}Alpha Hall`);
  });

  it('requires authentication to read and blocks Faculty from writing', async () => {
    const created = await createRoom(`${PREFIX}Lab F`);
    const id = created.body.room.id as string;

    const anonymous = await request(createApp()).get('/api/rooms');
    expect(anonymous.status).toBe(401);

    const facultyCreate = await createRoom(`${PREFIX}Lab G`, facultyToken);
    expect(facultyCreate.status).toBe(403);
    expect(facultyCreate.body.error.code).toBe('FORBIDDEN');

    const facultyToggle = await request(createApp())
      .patch(`/api/rooms/${id}`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ is_under_maintenance: true });
    expect(facultyToggle.status).toBe(403);

    // The blocked write changed nothing.
    expect((await prisma.room.findUnique({ where: { id } }))?.is_under_maintenance).toBe(false);
  });

  it('returns 400 for an empty name and 404 for an unknown id', async () => {
    const empty = await request(createApp())
      .post('/api/rooms')
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ name: '   ' });
    expect(empty.status).toBe(400);

    const missing = await request(createApp())
      .patch('/api/rooms/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ is_under_maintenance: true });
    expect(missing.status).toBe(404);
  });
});