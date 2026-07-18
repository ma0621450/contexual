import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FileProcessingJobStatus,
  FileProcessingStatus,
} from '@contexual/database';
import { PrismaService } from '../database/prisma.service';
import { ClamAvService } from './clamav.service';
import {
  DocumentExtractorService,
  DocumentProcessingError,
} from './document-extractor.service';
import { sniffFileContent } from './content-sniffer';
import { StorageService } from './storage.service';

export type ClaimedFileJob = {
  id: string;
  fileId: string;
  organizationId: string;
  attempts: number;
  maxAttempts: number;
};

@Injectable()
export class FileProcessingWorkerService {
  private readonly logger = new Logger(FileProcessingWorkerService.name);
  private readonly workerId = `${process.pid}-${crypto.randomUUID()}`;
  private readonly staleLockMs: number;
  private readonly pollIntervalMs: number;
  private readonly maxFileBytes: number;
  private stopping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly clamAv: ClamAvService,
    private readonly extractor: DocumentExtractorService,
    config: ConfigService,
  ) {
    this.staleLockMs = Number(
      config.get<string>('FILE_JOB_STALE_LOCK_MS') || 10 * 60_000,
    );
    this.pollIntervalMs = Number(
      config.get<string>('FILE_WORKER_POLL_MS') || 1_000,
    );
    this.maxFileBytes = Number(
      config.get<string>('MAX_FILE_BYTES') || 25_000_000,
    );
  }

  stop() {
    this.stopping = true;
  }

  async run(): Promise<void> {
    this.logger.log(`File processing worker ${this.workerId} started`);
    while (!this.stopping) {
      const processed = await this.processNext().catch((error: unknown) => {
        this.logger.error(
          'Unexpected worker loop failure',
          error instanceof Error ? error.stack : String(error),
        );
        return false;
      });
      if (!processed) await delay(this.pollIntervalMs);
    }
  }

  async processNext(): Promise<boolean> {
    const job = await this.claimNextJob();
    if (!job) return false;
    await this.processClaimedJob(job);
    return true;
  }

  async claimNextJob(): Promise<ClaimedFileJob | null> {
    const staleBefore = new Date(Date.now() - this.staleLockMs);
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config('app.file_worker', 'true', true)
      `;
      await tx.$executeRaw`
        UPDATE "FileProcessingJob"
        SET "status" = 'RETRY',
            "runAfter" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
            "lockedAt" = NULL,
            "lockedBy" = NULL,
            "lastErrorCode" = 'STALE_LOCK_RECOVERED',
            "lastErrorMessage" = 'A stale worker lock was recovered',
            "updatedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        WHERE "status" = 'PROCESSING'
          AND "lockedAt" < ${staleBefore}
      `;
      return tx.$queryRaw<ClaimedFileJob[]>`
        WITH candidate AS (
          SELECT "id"
          FROM "FileProcessingJob"
          WHERE "status" IN ('PENDING', 'RETRY')
            AND "runAfter" <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
          ORDER BY "runAfter" ASC, "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE "FileProcessingJob" AS job
        SET "status" = 'PROCESSING',
            "attempts" = job."attempts" + 1,
            "lockedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
            "lockedBy" = ${this.workerId},
            "updatedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        FROM candidate
        WHERE job."id" = candidate."id"
        RETURNING job."id", job."fileId", job."organizationId",
                  job."attempts", job."maxAttempts"
      `;
    });
    return rows[0] ?? null;
  }

  private async processClaimedJob(job: ClaimedFileJob): Promise<void> {
    const file = await this.prisma.withTenant(job.organizationId, (tx) =>
      tx.storedFile.findFirst({
        where: { id: job.fileId, organizationId: job.organizationId },
      }),
    );
    if (!file) return;
    if (file.processingStatus === FileProcessingStatus.READY) {
      await this.completeJob(job);
      return;
    }
    if (file.processingStatus === FileProcessingStatus.QUARANTINED) {
      await this.failJob(job, 'QUARANTINED', 'The file is quarantined', false);
      return;
    }

    try {
      await this.prisma.withTenant(job.organizationId, (tx) =>
        tx.storedFile.update({
          where: { id: file.id, organizationId: job.organizationId },
          data: {
            processingStatus: FileProcessingStatus.SCANNING,
            scanStartedAt: new Date(),
            failureCode: null,
            failureMessage: null,
          },
        }),
      );
      const body = await this.storage.get(file.storageKey);
      if (body.length <= 0 || body.length > this.maxFileBytes) {
        throw new DocumentProcessingError(
          'FILE_SIZE_INVALID',
          'The stored file size is invalid or exceeds the processing limit',
        );
      }
      const sniffed = sniffFileContent(body);
      if (!sniffed) {
        throw new DocumentProcessingError(
          'UNSUPPORTED_CONTENT',
          'The file content is not a supported type',
        );
      }

      const scan = await this.clamAv.scan(body);
      if (scan.outcome === 'infected') {
        await this.quarantineInfected(job);
        return;
      }
      if (scan.outcome === 'error') {
        throw new DocumentProcessingError(
          'SCAN_UNAVAILABLE',
          'Malware scanning could not be completed',
          true,
        );
      }

      await this.prisma.withTenant(job.organizationId, (tx) =>
        tx.storedFile.update({
          where: { id: file.id, organizationId: job.organizationId },
          data: {
            detectedMimeType: sniffed.mimeType,
            sha256: sniffed.sha256,
            scannedAt: new Date(),
            scanBypassed: scan.outcome === 'bypassed',
            processingStatus: FileProcessingStatus.EXTRACTING,
            extractionStartedAt: new Date(),
          },
        }),
      );
      const extractedText = await this.extractor.extract(
        body,
        sniffed.mimeType,
      );
      const cleanKey = await this.storage.promote(
        file.storageKey,
        job.organizationId,
        file.id,
        sniffed.mimeType,
      );
      try {
        await this.prisma.withTenant(job.organizationId, async (tx) => {
          await tx.storedFile.update({
            where: { id: file.id, organizationId: job.organizationId },
            data: {
              storageKey: cleanKey,
              extractedText,
              extractedAt: new Date(),
              processingStatus: FileProcessingStatus.READY,
              failureCode: null,
              failureMessage: null,
            },
          });
          await tx.fileProcessingJob.update({
            where: { id: job.id },
            data: {
              status: FileProcessingJobStatus.COMPLETED,
              completedAt: new Date(),
              lockedAt: null,
              lockedBy: null,
              lastErrorCode: null,
              lastErrorMessage: null,
            },
          });
        });
      } catch (error) {
        await this.storage.remove(cleanKey).catch(() => undefined);
        throw error;
      }
      if (cleanKey !== file.storageKey) {
        await this.storage.remove(file.storageKey).catch((error: unknown) => {
          this.logger.warn(
            `Could not remove quarantine object: ${String(error)}`,
          );
        });
      }
    } catch (error) {
      const processingError =
        error instanceof DocumentProcessingError
          ? error
          : new DocumentProcessingError(
              'PROCESSING_ERROR',
              'File processing failed',
              true,
            );
      await this.failJob(
        job,
        processingError.code,
        processingError.safeMessage,
        processingError.retryable,
      );
    }
  }

  private async quarantineInfected(job: ClaimedFileJob) {
    await this.prisma.withTenant(job.organizationId, async (tx) => {
      await tx.storedFile.update({
        where: { id: job.fileId, organizationId: job.organizationId },
        data: {
          processingStatus: FileProcessingStatus.QUARANTINED,
          scannedAt: new Date(),
          failureCode: 'MALWARE_DETECTED',
          failureMessage: 'Malware was detected in this file',
          extractedText: null,
        },
      });
      await tx.fileProcessingJob.update({
        where: { id: job.id },
        data: {
          status: FileProcessingJobStatus.FAILED,
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: 'MALWARE_DETECTED',
          lastErrorMessage: 'Malware was detected in this file',
        },
      });
    });
  }

  private async completeJob(job: ClaimedFileJob) {
    await this.prisma.withTenant(job.organizationId, (tx) =>
      tx.fileProcessingJob.update({
        where: { id: job.id },
        data: {
          status: FileProcessingJobStatus.COMPLETED,
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      }),
    );
  }

  private async failJob(
    job: ClaimedFileJob,
    code: string,
    message: string,
    retryable: boolean,
  ) {
    const retry = retryable && job.attempts < job.maxAttempts;
    await this.prisma.withTenant(job.organizationId, async (tx) => {
      await tx.storedFile.update({
        where: { id: job.fileId, organizationId: job.organizationId },
        data: {
          processingStatus: FileProcessingStatus.FAILED,
          failureCode: code,
          failureMessage: message,
          extractedText: null,
        },
      });
      await tx.fileProcessingJob.update({
        where: { id: job.id },
        data: {
          status: retry
            ? FileProcessingJobStatus.RETRY
            : FileProcessingJobStatus.FAILED,
          runAfter: retry
            ? new Date(Date.now() + retryBackoffMs(job.attempts))
            : new Date(),
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: code,
          lastErrorMessage: message,
        },
      });
    });
  }
}

export function retryBackoffMs(attempt: number): number {
  return Math.min(60 * 60_000, 5_000 * 2 ** Math.max(0, attempt - 1));
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
