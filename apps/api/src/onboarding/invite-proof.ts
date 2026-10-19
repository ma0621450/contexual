import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export function generateInviteEmailProof(): { proof: string; hash: string } {
  const proof = randomBytes(32).toString('base64url');
  return { proof, hash: hashInviteEmailProof(proof) };
}

export function hashInviteEmailProof(proof: string): string {
  return createHash('sha256').update(proof).digest('hex');
}

export function verifyInviteEmailProof(
  proof: string | undefined | null,
  expectedHash: string | null,
): boolean {
  if (!proof || !expectedHash) return false;
  const actual = Buffer.from(hashInviteEmailProof(proof), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
