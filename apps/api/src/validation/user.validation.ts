import { z } from 'zod';

/** PATCH /api/users/me — editable credentials for the signed-in account. */
export const updateMeSchema = z
  .object({
    email: z.string().email('Enter a valid email address').optional(),
    current_password: z.string().min(1, 'Enter your current password').optional(),
    new_password: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .max(128, 'New password must be at most 128 characters')
      .optional(),
  })
  .strict()
  .refine((data) => data.email !== undefined || data.new_password !== undefined, {
    message: 'Provide an email or a new password to update',
  })
  .refine(
    (data) => {
      // Any credential change must prove ownership with the current password.
      if (data.email !== undefined || data.new_password !== undefined) {
        return data.current_password !== undefined && data.current_password.length > 0;
      }
      return true;
    },
    { message: 'Enter your current password to confirm changes', path: ['current_password'] },
  );

export type UpdateMeInput = z.infer<typeof updateMeSchema>;
