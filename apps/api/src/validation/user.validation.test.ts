/** PATCH /api/users/me validation: email/password edits need current password. */
import { describe, expect, it } from 'vitest';
import { updateMeSchema } from './user.validation.js';

describe('updateMeSchema', () => {
  it('accepts an email change with current password', () => {
    const parsed = updateMeSchema.safeParse({
      email: 'new.chair@faciload.local',
      current_password: 'old-secret',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a password change with current password', () => {
    const parsed = updateMeSchema.safeParse({
      current_password: 'old-secret',
      new_password: 'brand-new-password',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects changes without the current password', () => {
    const parsed = updateMeSchema.safeParse({ email: 'new.chair@faciload.local' });
    expect(parsed.success).toBe(false);
  });

  it('rejects a short new password', () => {
    const parsed = updateMeSchema.safeParse({
      current_password: 'old-secret',
      new_password: 'short',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an empty body', () => {
    expect(updateMeSchema.safeParse({}).success).toBe(false);
  });
});
