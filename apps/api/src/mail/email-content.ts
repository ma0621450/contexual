import type { EncryptionService } from '../common/crypto/encryption.service';

const PREFIX = 'enc:v1:';

/** Placeholder left in html/text after delivery finishes. */
export const REDACTED_EMAIL_CONTENT = '[redacted after delivery]';

/**
 * Outbox bodies contain one-time secrets (codes, reset and invite links), so
 * they are encrypted with ENCRYPTION_KEY while queued.
 */
export function sealEmailContent(
  encryption: EncryptionService,
  plaintext: string,
): string {
  const { iv, ciphertext } = encryption.encrypt(plaintext);
  return `${PREFIX}${iv}:${ciphertext}`;
}

/** Rows queued before encryption shipped are still plaintext and pass through. */
export function openEmailContent(
  encryption: EncryptionService,
  stored: string,
): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const [iv, ciphertext] = stored.slice(PREFIX.length).split(':');
  if (!iv || !ciphertext) throw new Error('Malformed sealed email content');
  return encryption.decrypt({ iv, ciphertext });
}
