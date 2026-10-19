import { z } from 'zod';

const newPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().email('Enter a valid email address'),
  password: newPassword,
});

export const signupFormSchema = registerSchema
  .extend({ confirmPassword: z.string().min(1, 'Confirm your password') })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const inviteSignupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  password: newPassword,
});

export const ORGANIZATION_TYPES = [
  { value: 'DESIGN_AGENCY', label: 'Design Agency' },
  { value: 'CREATIVE_STUDIO', label: 'Creative Studio' },
  { value: 'BRAND_CONSULTANCY', label: 'Brand Consultancy' },
  { value: 'UX_RESEARCH_FIRM', label: 'UX Research Firm' },
] as const;

export const TEAM_SIZES = [
  { value: 'JUST_ME', label: 'Just me' },
  { value: 'SIZE_2_10', label: '2–10' },
  { value: 'SIZE_11_25', label: '11–25' },
  { value: 'SIZE_26_100', label: '26–100' },
  { value: 'SIZE_100_PLUS', label: '100+' },
] as const;

export type OrganizationTypeValue = (typeof ORGANIZATION_TYPES)[number]['value'];
export type TeamSizeValue = (typeof TEAM_SIZES)[number]['value'];

export const WORKSPACE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const workspaceSlugSchema = z
  .string()
  .trim()
  .min(1, 'Click the generate icon or type a workspace URL')
  .min(3, 'Use at least 3 characters')
  .max(48, 'Use at most 48 characters')
  .regex(
    WORKSPACE_SLUG_PATTERN,
    'Use lowercase letters, numbers, or single hyphens',
  );

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const verifyEmailSchema = z.object({
  otp: z
    .string()
    .length(4, 'Enter the 4-digit code')
    .regex(/^\d{4}$/, 'Code must be 4 digits'),
});

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Organization name must be at least 2 characters')
    .max(100, 'Organization name must be at most 100 characters')
    .regex(/[A-Za-z0-9]/, 'Organization name must include letters or numbers'),
  slug: workspaceSlugSchema,
  organizationType: z.enum(
    ORGANIZATION_TYPES.map((option) => option.value) as [
      OrganizationTypeValue,
      ...OrganizationTypeValue[],
    ],
    { errorMap: () => ({ message: 'Choose your organization type' }) },
  ),
  teamSize: z
    .enum(
      TEAM_SIZES.map((option) => option.value) as [
        TeamSizeValue,
        ...TeamSizeValue[],
      ],
    )
    .optional(),
});

export const joinOrganizationSchema = z.object({
  token: z.string().trim().min(1, 'Invite token is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: newPassword,
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .max(128),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: 'New passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type JoinOrganizationInput = z.infer<typeof joinOrganizationSchema>;
