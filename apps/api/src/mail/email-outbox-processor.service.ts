import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailOutboxStatus } from '@contexual/database';
import { EncryptionService } from '../common/crypto/encryption.service';
import { PrismaService } from '../database/prisma.service';
import { openEmailContent, REDACTED_EMAIL_CONTENT } from './email-content';
import {
  EmailDeliveryService,
  MailDeliveryError,
} from './email-delivery.service';

export type ClaimedEmail = {
  id: string;
  idempotencyKey: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attempts: number;
  maxAttempts: number;
};

@Injectable()
export class EmailOutboxProcessorService {
  private readonly logger = new Logger(EmailOutboxProcessorService.name);
  private readonly workerId = `email-${process.pid}-${crypto.randomUUID()}`;
  private readonly pollIntervalMs: number;
  private readonly staleLockMs: number;
  private stopping = false;
  private lastRedactionAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: EmailDeliveryService,
    config: ConfigService,
    private readonly encryption: EncryptionService,
  ) {
    this.pollIntervalMs = Number(
      config.get<string>('EMAIL_WORKER_POLL_MS') || 1_000,
    );
    this.staleLockMs = Number(
      config.get<string>('EMAIL_STALE_LOCK_MS') || 5 * 60_000,
    );
  }

  stop() {
    this.stopping = true;
  }

  async run(): Promise<void> {
    this.logger.log(`Email outbox processor ${this.workerId} started`);
    while (!this.stopping) {
      await this.redactFinishedEmailsPeriodically();
      const processed = await this.processNext().catch((error: unknown) => {
        this.logger.error(
          'Unexpected email outbox loop failure',
          error instanceof Error ? error.stack : String(error),
        );
        return false;
      });
      if (!processed) await delay(this.pollIntervalMs);
    }
  }

  async processNext(): Promise<boolean> {
    const email = await this.claimNext();
    if (!email) return false;

    try {
      const providerId = await this.delivery.deliver(this.open(email));
      await this.prisma.emailOutbox.updateMany({
        where: { id: email.id, lockedBy: this.workerId },
        data: {
          status: EmailOutboxStatus.SENT,
          providerId,
          sentAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
          ...redactedContent(),
        },
      });
    } catch (error) {
      const normalized =
        error instanceof MailDeliveryError
          ? error
          : new MailDeliveryError('Unexpected email delivery failure', true);
      const retryable =
        normalized.retryable && email.attempts < email.maxAttempts;
      await this.prisma.emailOutbox.updateMany({
        where: { id: email.id, lockedBy: this.workerId },
        data: {
          status: retryable
            ? EmailOutboxStatus.RETRY
            : EmailOutboxStatus.FAILED,
          runAfter: retryable
            ? new Date(Date.now() + emailRetryBackoffMs(email.attempts))
            : new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: normalized.message,
          ...(retryable ? {} : redactedContent()),
        },
      });
    }
    return true;
  }

  /** Clears bodies of finished emails, including rows written before redaction shipped. */
  async redactFinishedEmails(): Promise<number> {
    const result = await this.prisma.emailOutbox.updateMany({
      where: {
        status: { in: [EmailOutboxStatus.SENT, EmailOutboxStatus.FAILED] },
        contentRedactedAt: null,
      },
      data: redactedContent(),
    });
    return result.count;
  }

  private async redactFinishedEmailsPeriodically() {
    if (Date.now() - this.lastRedactionAt < REDACTION_INTERVAL_MS) return;
    this.lastRedactionAt = Date.now();
    await this.redactFinishedEmails().catch((error: unknown) => {
      this.logger.warn(
        `Email content redaction failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private open(email: ClaimedEmail): ClaimedEmail {
    try {
      return {
        ...email,
        html: openEmailContent(this.encryption, email.html),
        text: openEmailContent(this.encryption, email.text),
      };
    } catch {
      throw new MailDeliveryError(
        'Email content could not be decrypted',
        false,
      );
    }
  }

  async claimNext(): Promise<ClaimedEmail | null> {
    const staleBefore = new Date(Date.now() - this.staleLockMs);
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.emailOutbox.updateMany({
        where: {
          status: EmailOutboxStatus.PROCESSING,
          lockedAt: { lt: staleBefore },
        },
        data: {
          status: EmailOutboxStatus.RETRY,
          runAfter: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: 'A stale email worker lock was recovered',
        },
      });
      return tx.$queryRaw<ClaimedEmail[]>`
        WITH candidate AS (
          SELECT "id"
          FROM "EmailOutbox"
          WHERE "status" IN ('PENDING', 'RETRY')
            AND "runAfter" <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
          ORDER BY "runAfter" ASC, "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE "EmailOutbox" AS email
        SET "status" = 'PROCESSING',
            "attempts" = email."attempts" + 1,
            "lockedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
            "lockedBy" = ${this.workerId},
            "updatedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        FROM candidate
        WHERE email."id" = candidate."id"
        RETURNING email."id", email."idempotencyKey", email."to",
                  email."subject", email."html", email."text",
                  email."attempts", email."maxAttempts"
      `;
    });
    return rows[0] ?? null;
  }
}

const REDACTION_INTERVAL_MS = 60 * 60_000;

function redactedContent() {
  return {
    html: REDACTED_EMAIL_CONTENT,
    text: REDACTED_EMAIL_CONTENT,
    contentRedactedAt: new Date(),
  };
}

export function emailRetryBackoffMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const base = Math.min(60 * 60_000, 5_000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.75 + random() * 0.5));
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
