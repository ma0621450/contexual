export const ACCESS_TOKEN_COOKIE = 'contexual_access_token';
export const REFRESH_TOKEN_COOKIE = 'contexual_refresh_token';

export type AccessTokenPayload = {
  sub: string;
  email: string;
  emailVerified: boolean;
  hasMembership: boolean;
  sessionVersion: number;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: Date | null;
  sessionVersion: number;
  memberships: { id: string }[];
};
