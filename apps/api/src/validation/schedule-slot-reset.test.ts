/** Reset-schedule validation: scoped bulk clear always needs term + password. */
import { describe, expect, it } from 'vitest';
import { resetScheduleSchema } from './schedule-slot.validation.js';

const TERM_ID = '11111111-1111-4111-8111-111111111111';
const FACULTY_ID = '22222222-2222-4222-8222-222222222222';
const ROOM_ID = '33333333-3333-4333-8333-333333333333';

describe('resetScheduleSchema', () => {
  it('accepts a whole-term reset with password', () => {
    const parsed = resetScheduleSchema.safeParse({ term_id: TERM_ID, password: 'chair-secret' });
    expect(parsed.success).toBe(true);
  });

  it('accepts a faculty-scoped reset', () => {
    const parsed = resetScheduleSchema.safeParse({
      term_id: TERM_ID,
      faculty_id: FACULTY_ID,
      password: 'chair-secret',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a room-scoped reset', () => {
    const parsed = resetScheduleSchema.safeParse({
      term_id: TERM_ID,
      room_id: ROOM_ID,
      password: 'chair-secret',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects faculty + room together (one scope at a time)', () => {
    const parsed = resetScheduleSchema.safeParse({
      term_id: TERM_ID,
      faculty_id: FACULTY_ID,
      room_id: ROOM_ID,
      password: 'chair-secret',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a missing password', () => {
    const parsed = resetScheduleSchema.safeParse({ term_id: TERM_ID, password: '' });
    expect(parsed.success).toBe(false);
  });
});
