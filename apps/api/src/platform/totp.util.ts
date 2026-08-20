import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DIGITS = 6;
const PERIOD_SECONDS = 30;

/**
 * Number of periods checked either side of the current one, tolerating clock
 * drift between the server and an authenticator app.
 */
const DRIFT_WINDOW = 1;

export function encodeBase32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function decodeBase32(secret: string): Buffer {
  const normalized = secret.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) {
      throw new Error('Invalid base32 character in TOTP secret');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

function generateCode(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

export function generateTotp(
  secret: string,
  atMs: number = Date.now(),
): string {
  const counter = Math.floor(atMs / 1000 / PERIOD_SECONDS);
  return generateCode(decodeBase32(secret), counter);
}

export function verifyTotp(
  secret: string,
  token: string,
  atMs: number = Date.now(),
): boolean {
  const normalized = token.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;

  let key: Buffer;
  try {
    key = decodeBase32(secret);
  } catch {
    return false;
  }

  const counter = Math.floor(atMs / 1000 / PERIOD_SECONDS);
  const candidate = Buffer.from(normalized, 'utf8');

  for (let drift = -DRIFT_WINDOW; drift <= DRIFT_WINDOW; drift += 1) {
    const expected = Buffer.from(generateCode(key, counter + drift), 'utf8');
    if (
      expected.length === candidate.length &&
      timingSafeEqual(expected, candidate)
    ) {
      return true;
    }
  }

  return false;
}

export function buildOtpAuthUrl(
  secret: string,
  accountEmail: string,
  issuer: string,
): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
