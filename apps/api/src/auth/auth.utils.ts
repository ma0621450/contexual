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
