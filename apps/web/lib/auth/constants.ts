export const ACCESS_TOKEN_COOKIE = 'contexual_access_token';
export const REFRESH_TOKEN_COOKIE = 'contexual_refresh_token';

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export type AccessTokenPayload = {
  sub: string;
  email: string;
  emailVerified: boolean;
  hasMembership: boolean;
  sessionVersion: number;
};
