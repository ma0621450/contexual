import { NotFoundException } from '@nestjs/common';
import { MemoryScope, MembershipRole, type Prisma } from '@contexual/database';
import type { AuthUser } from '../auth/auth.types';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../database/prisma.service';
import { MemoriesService } from './memories.service';

describe('MemoriesService tenant isolation', () => {
  const findFirst = jest.fn();
  const transaction = {
    memory: {
      findFirst,
      delete: jest.fn(),
    },
  } as unknown as Prisma.TransactionClient;
  const prisma = {
    withTenant: jest.fn(
      (
        _organizationId: string,
        operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
      ) => operation(transaction),
    ),
  } as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const service = new MemoriesService(prisma, audit);
  const user: AuthUser = {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    emailVerifiedAt: new Date(),
    sessionVersion: 0,
    activeOrganizationId: 'org-1',
    memberships: [
      {
        id: 'membership-1',
        organizationId: 'org-1',
        role: MembershipRole.MEMBER,
        suspended: false,
      },
    ],
  };

  beforeEach(() => jest.clearAllMocks());

  it('always includes the active organization in memory lookup', async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.remove('org-1', user, 'memory-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'memory-1', organizationId: 'org-1' },
    });
  });

  it('does not expose another user personal memory', async () => {
    findFirst.mockResolvedValue({
      id: 'memory-1',
      organizationId: 'org-1',
      userId: 'user-2',
      scope: MemoryScope.USER,
    });

    await expect(service.remove('org-1', user, 'memory-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
