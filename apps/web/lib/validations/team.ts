import { z } from 'zod';

export const organizationRoleSchema = z.enum(['ADMIN', 'MEMBER']);

export const inviteMemberSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  role: organizationRoleSchema.default('MEMBER'),
});

export const updateMemberRoleSchema = z.object({
  role: organizationRoleSchema,
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
