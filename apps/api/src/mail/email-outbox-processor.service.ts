import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailOutboxStatus } from '@contexual/database';
import { PrismaService } from '../database/prisma.service';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: EmailDeliveryService,
    config: ConfigService,
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
      const providerId = await this.delivery.deliver(email);
      await this.prisma.emailOutbox.updateMany({
        where: { id: email.id, lockedBy: this.workerId },
        data: {
          status: EmailOutboxStatus.SENT,
          providerId,
          sentAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
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
        },
      });
    }
    return true;
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
