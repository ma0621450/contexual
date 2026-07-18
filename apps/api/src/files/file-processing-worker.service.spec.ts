import {
  FileProcessingJobStatus,
  FileProcessingStatus,
} from '@contexual/database';
import {
  FileProcessingWorkerService,
  retryBackoffMs,
} from './file-processing-worker.service';

describe('FileProcessingWorkerService', () => {
  it('claims a PostgreSQL job and increments its attempt atomically', async () => {
    const claimed = {
      id: 'job-1',
      fileId: 'file-1',
      organizationId: 'org-1',
      attempts: 2,
      maxAttempts: 5,
    };
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([claimed]),
    };
    const prisma = {
      $transaction: jest.fn((operation: (value: typeof tx) => unknown) =>
        operation(tx),
      ),
    };
    const worker = new FileProcessingWorkerService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
    );

    await expect(worker.claimNextJob()).resolves.toEqual(claimed);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('completes an already READY file idempotently', async () => {
    const job = {
      id: 'job-1',
      fileId: 'file-1',
      organizationId: 'org-1',
      attempts: 1,
      maxAttempts: 5,
    };
    const jobUpdate = jest.fn().mockResolvedValue({});
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([job]),
    };
    const tenantTx = {
      storedFile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'file-1',
          processingStatus: FileProcessingStatus.READY,
        }),
      },
      fileProcessingJob: { update: jobUpdate },
    };
    const prisma = {
      $transaction: jest.fn((operation: (value: typeof tx) => unknown) =>
        operation(tx),
      ),
      withTenant: jest.fn(
        (
          _organizationId: string,
          operation: (value: typeof tenantTx) => unknown,
        ) => operation(tenantTx),
      ),
    };
    const worker = new FileProcessingWorkerService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
    );

    await expect(worker.processNext()).resolves.toBe(true);
    expect(jobUpdate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(jobUpdate.mock.calls)).toContain(
      FileProcessingJobStatus.COMPLETED,
    );
  });

  it('uses bounded exponential retry backoff', () => {
    expect(retryBackoffMs(1)).toBe(5_000);
    expect(retryBackoffMs(2)).toBe(10_000);
    expect(retryBackoffMs(20)).toBe(3_600_000);
  });
});
