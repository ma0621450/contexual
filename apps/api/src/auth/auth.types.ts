import type { MembershipRole } from '@contexual/database';

export const ACCESS_TOKEN_COOKIE = 'contexual_access_token';
export const REFRESH_TOKEN_COOKIE = 'contexual_refresh_token';

export type AccessTokenPayload = {
  sub: string;
  email: string;
  emailVerified: boolean;
  hasMembership: boolean;
  sessionVersion: number;
};

export type AuthMembership = {
  id: string;
  organizationId: string;
  role: MembershipRole;
  suspended: boolean;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: Date | null;
  sessionVersion: number;
  activeOrganizationId: string | null;
  memberships: AuthMembership[];
};

export type AuthUserWithPassword = AuthUser & {
  passwordHash: string;
};

export function getActiveMembership(user: AuthUser): AuthMembership | null {
  if (!user.activeOrganizationId) {
    return null;
  }

  return (
    user.memberships.find(
      (membership) =>
        membership.organizationId === user.activeOrganizationId &&
        !membership.suspended,
    ) ?? null
  );
}
