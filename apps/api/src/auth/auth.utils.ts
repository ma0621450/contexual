import { createHash, randomBytes, randomInt } from 'crypto';
import * as bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;
const DEV_STATIC_OTP = '0000';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

let dummyPasswordHash: Promise<string> | undefined;

/** Spends the same bcrypt work as a real check so unknown emails are not faster. */
export async function verifyAgainstDummyHash(password: string): Promise<false> {
  dummyPasswordHash ??= bcrypt.hash(
    randomBytes(16).toString('hex'),
    BCRYPT_ROUNDS,
  );
  await bcrypt.compare(password, await dummyPasswordHash);
  return false;
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateOtp(): string {
  return String(randomInt(0, 10000)).padStart(4, '0');
}

export function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

/** Random per send: an OTP-derived key would expose the code, which is only 4 digits. */
export function verificationIdempotencyKey(userId: string): string {
  return `verification:${userId}:${randomBytes(12).toString('hex')}`;
}

export function isDevOtpAllowed(otp: string, mailConfigured: boolean): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    !mailConfigured &&
    otp === DEV_STATIC_OTP
  );
}

export function generatePasswordResetToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashPasswordResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const OTP_EXPIRY_MINUTES = 15;
export const PASSWORD_RESET_EXPIRY_HOURS = 1;
