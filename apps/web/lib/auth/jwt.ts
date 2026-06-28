import { SignJWT, jwtVerify } from 'jose';
import type { AccessTokenPayload } from './constants';

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  payload: AccessTokenPayload,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(process.env.ACCESS_TOKEN_EXPIRY ?? '15m')
    .sign(getJwtSecret());
}

export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return {
      sub: payload.sub as string,
      email: payload.email as string,
      emailVerified: Boolean(payload.emailVerified),
      hasMembership: Boolean(payload.hasMembership),
      sessionVersion: Number(payload.sessionVersion),
    };
  } catch {
    return null;
  }
}
