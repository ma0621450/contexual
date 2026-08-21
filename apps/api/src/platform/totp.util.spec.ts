import {
  buildOtpAuthUrl,
  decodeBase32,
  encodeBase32,
  generateTotp,
  generateTotpSecret,
  verifyTotp,
} from './totp.util';

describe('totp', () => {
  it('round-trips base32', () => {
    const buffer = Buffer.from('contexual-platform', 'utf8');
    expect(decodeBase32(encodeBase32(buffer))).toEqual(buffer);
  });

  it('matches the RFC 4226 reference vectors', () => {
    // RFC 4226 uses the ASCII secret "12345678901234567890".
    const secret = encodeBase32(Buffer.from('12345678901234567890', 'utf8'));
    const period = 30_000;

    expect(generateTotp(secret, 0)).toBe('755224');
    expect(generateTotp(secret, period)).toBe('287082');
    expect(generateTotp(secret, period * 2)).toBe('359152');
  });

  it('accepts the current code', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, generateTotp(secret))).toBe(true);
  });

  it('tolerates one period of clock drift in either direction', () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;

    expect(verifyTotp(secret, generateTotp(secret, now - 30_000), now)).toBe(
      true,
    );
    expect(verifyTotp(secret, generateTotp(secret, now + 30_000), now)).toBe(
      true,
    );
  });

  it('rejects codes beyond the drift window', () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;

    expect(verifyTotp(secret, generateTotp(secret, now - 120_000), now)).toBe(
      false,
    );
  });

  it('rejects malformed input without throwing', () => {
    const secret = generateTotpSecret();

    expect(verifyTotp(secret, '')).toBe(false);
    expect(verifyTotp(secret, '12345')).toBe(false);
    expect(verifyTotp(secret, 'abcdef')).toBe(false);
    expect(verifyTotp('not-base32!', '123456')).toBe(false);
  });

  it('builds a scannable provisioning url', () => {
    const url = buildOtpAuthUrl('ABCDEFGH', 'staff@example.com', 'Contexual');

    expect(url).toContain('otpauth://totp/Contexual%3Astaff%40example.com');
    expect(url).toContain('secret=ABCDEFGH');
    expect(url).toContain('issuer=Contexual');
  });
});
