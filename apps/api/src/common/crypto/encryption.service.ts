import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

export type EncryptedPayload = {
  ciphertext: string;
  iv: string;
};

@Injectable()
export class EncryptionService implements OnModuleInit {
  private key!: Buffer;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const rawKey = this.configService.getOrThrow<string>('ENCRYPTION_KEY');
    const key = Buffer.from(rawKey, 'hex');

    if (key.length !== KEY_LENGTH) {
      throw new Error(
        `ENCRYPTION_KEY must be a ${KEY_LENGTH}-byte value encoded as ${KEY_LENGTH * 2} hex characters`,
      );
    }

    this.key = key;
  }

  encrypt(plaintext: string): EncryptedPayload {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: `${encrypted.toString('base64')}.${authTag.toString('base64')}`,
      iv: iv.toString('base64'),
    };
  }

  decrypt(payload: EncryptedPayload): string {
    const [encryptedB64, authTagB64] = payload.ciphertext.split('.');

    if (!encryptedB64 || !authTagB64) {
      throw new Error('Malformed ciphertext');
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(payload.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedB64, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}
