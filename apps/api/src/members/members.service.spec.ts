import { ForbiddenException } from '@nestjs/common';
import { getUtcMonthStart } from '../common/usage/usage-period';
import { MembersService } from './members.service';

describe('MembersService self usage', () => {
  const prisma = {
    membership: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    organization: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    usageLog: {
      aggregate: jest.fn(),
    },
  };
  const service = new MembersService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.membership.updateMany.mockResolvedValue({ count: 0 });
    prisma.organization.updateMany.mockResolvedValue({ count: 0 });
  });

  it('returns only the authenticated member usage and limits', async () => {
    prisma.usageLog.aggregate.mockResolvedValue({
      _sum: {
        promptTokens: 100,
        completionTokens: 50,
        estimatedCostCents: 7,
      },
    });
    prisma.membership.findUnique.mockResolvedValue({
      spendLimitCents: 1000,
      spendUsedCents: 70,
      tokenLimit: 5000,
      tokensUsed: 150,
      suspended: false,
    });
    prisma.organization.findUnique.mockResolvedValue({
      monthlySpendLimitCents: 5000,
      monthlySpendUsedCents: 700,
      monthlyTokenLimit: 50000,
      monthlyTokensUsed: 1500,
    });

    const result: unknown = await service.getMyUsage('org-1', 'user-1');

    expect(prisma.usageLog.aggregate).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        userId: 'user-1',
        createdAt: { gte: getUtcMonthStart() },
      },
      _sum: {
        promptTokens: true,
        completionTokens: true,
        estimatedCostCents: true,
      },
    });
    expect(result).toEqual({
      spendPeriodStartedAt: getUtcMonthStart(),
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        estimatedCostCents: 7,
        tokensUsed: 150,
        spendUsedCents: 70,
      },
      limits: {
        spendLimitCents: 1000,
        tokenLimit: 5000,
      },
      organizationLimits: {
        monthlySpendLimitCents: 5000,
        monthlySpendUsedCents: 700,
        monthlyTokenLimit: 50000,
        monthlyTokensUsed: 1500,
      },
    });
    expect(result).not.toHaveProperty('members');
  });

  it('rejects suspended memberships', async () => {
    prisma.usageLog.aggregate.mockResolvedValue({ _sum: {} });
    prisma.membership.findUnique.mockResolvedValue({
      suspended: true,
    });
    prisma.organization.findUnique.mockResolvedValue(null);

    await expect(service.getMyUsage('org-1', 'user-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
