import type { PlatformRole } from '@contexual/database';

export const PLATFORM_ACCESS_TOKEN_COOKIE = 'contexual_platform_token';

/**
 * Platform sessions are short by design. Staff hold cross-tenant read access,
 * so an idle browser should stop being useful quickly.
 */
export const PLATFORM_SESSION_MINUTES = 60;

export const PLATFORM_TOKEN_TYPE = 'platform' as const;

export type PlatformTokenPayload = {
  sub: string;
  typ: typeof PLATFORM_TOKEN_TYPE;
  email: string;
  role: PlatformRole;
};

export type PlatformAdminContext = {
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
  mustChangePassword: boolean;
};

const ROLE_RANK: Record<PlatformRole, number> = {
  SUPPORT: 0,
  OPERATOR: 1,
  OWNER: 2,
};

export function hasPlatformRole(
  role: PlatformRole,
  minimum: PlatformRole,
): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
