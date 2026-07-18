import { ConflictException } from '@nestjs/common';
import { FileProcessingStatus } from '@contexual/database';
import { FilesService } from './files.service';

describe('FilesService lifecycle gating', () => {
  const storage = {
    get: jest.fn(),
  };

  it('blocks downloads until the file is READY', async () => {
    const storedFile = {
      findFirst: jest.fn().mockResolvedValue({
        id: 'file-1',
        organizationId: 'org-1',
        storageKey: 'quarantine/org-1/file-1',
        processingStatus: FileProcessingStatus.SCANNING,
      }),
    };
    const prisma = {
      withTenant: jest.fn(
        (_organizationId: string, operation: (tx: unknown) => unknown) =>
          operation({ storedFile }),
      ),
    };
    const service = new FilesService(prisma as never, storage as never);

    await expect(service.download('org-1', 'file-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(storage.get).not.toHaveBeenCalled();
  });

  it('queries chat attachments with a READY state constraint', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      withTenant: jest.fn(
        (_organizationId: string, operation: (tx: unknown) => unknown) =>
          operation({ storedFile: { findMany } }),
      ),
    };
    const service = new FilesService(prisma as never, storage as never);

    await expect(
      service.getAttachments('org-1', ['file-1']),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        id: { in: ['file-1'] },
        processingStatus: FileProcessingStatus.READY,
      },
    });
  });
});
