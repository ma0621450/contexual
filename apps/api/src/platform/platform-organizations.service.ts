import { Injectable, NotFoundException } from '@nestjs/common';
import { FileProcessingStatus, type Prisma } from '@contexual/database';
import { PrismaService } from '../database/prisma.service';
import { getPlanLimits } from '../organizations/plan-limits';
import type { ListOrganizationsQueryDto } from './dto/platform.dto';

const DEFAULT_PAGE_SIZE = 25;

@Injectable()
export class PlatformOrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListOrganizationsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const search = query.search?.trim();

    const where: Prisma.OrganizationWhereInput = {
      ...(query.planTier ? { planTier: query.planTier } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, organizations, totalsByPlan] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          slug: true,
          planTier: true,
          subscriptionStatus: true,
          monthlyTokensUsed: true,
          monthlySpendUsedCents: true,
          storageBytesUsed: true,
          storedFileCount: true,
          createdAt: true,
          _count: { select: { memberships: true } },
        },
      }),
      this.prisma.organization.groupBy({
        by: ['planTier'],
        _count: { _all: true },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      planTotals: Object.fromEntries(
        totalsByPlan.map((entry) => [entry.planTier, entry._count._all]),
      ),
      organizations: organizations.map((organization) => {
        const limits = getPlanLimits(organization.planTier);
        return {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          planTier: organization.planTier,
          subscriptionStatus: organization.subscriptionStatus,
          memberCount: organization._count.memberships,
          maxMembers: limits.maxMembers,
          monthlyTokensUsed: organization.monthlyTokensUsed,
          maxMonthlyTokens: limits.maxMonthlyTokens,
          monthlySpendUsedCents: organization.monthlySpendUsedCents,
          storageBytesUsed: Number(organization.storageBytesUsed),
          maxStorageBytes: limits.maxStorageBytes,
          storedFileCount: organization.storedFileCount,
          createdAt: organization.createdAt,
        };
      }),
    };
  }

  async get(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        planTier: true,
        maxMembers: true,
        subscriptionStatus: true,
        stripeCustomerId: true,
        monthlySpendLimitCents: true,
        monthlySpendUsedCents: true,
        monthlyTokenLimit: true,
        monthlyTokensUsed: true,
        usagePeriodStartedAt: true,
        storageBytesUsed: true,
        storedFileCount: true,
        createdAt: true,
        memberships: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            suspended: true,
            tokensUsed: true,
            spendUsedCents: true,
            createdAt: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        providers: {
          orderBy: { provider: 'asc' },
          select: {
            provider: true,
            defaultModel: true,
            enabledModels: true,
            connectedAt: true,
            connectedBy: { select: { name: true, email: true } },
          },
        },
        _count: { select: { conversations: true, memories: true } },
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const [usageByModel, recentAudit, fileJobCounts] = await Promise.all([
      this.prisma.usageLog.groupBy({
        by: ['provider', 'model'],
        where: { organizationId },
        _sum: {
          promptTokens: true,
          completionTokens: true,
          estimatedCostCents: true,
        },
        _count: { _all: true },
      }),
      this.prisma.auditLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          action: true,
          details: true,
          createdAt: true,
          actor: { select: { name: true, email: true } },
        },
      }),
      this.countFileJobs(organizationId),
    ]);

    const limits = getPlanLimits(organization.planTier);

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      planTier: organization.planTier,
      subscriptionStatus: organization.subscriptionStatus,
      hasStripeCustomer: organization.stripeCustomerId !== null,
      createdAt: organization.createdAt,
      usage: {
        periodStartedAt: organization.usagePeriodStartedAt,
        monthlyTokensUsed: organization.monthlyTokensUsed,
        monthlyTokenLimit: organization.monthlyTokenLimit,
        monthlySpendUsedCents: organization.monthlySpendUsedCents,
        monthlySpendLimitCents: organization.monthlySpendLimitCents,
      },
      limits,
      counts: {
        members: organization.memberships.length,
        conversations: organization._count.conversations,
        memories: organization._count.memories,
        files: organization.storedFileCount,
        storageBytesUsed: Number(organization.storageBytesUsed),
      },
      members: organization.memberships.map((membership) => ({
        membershipId: membership.id,
        userId: membership.user.id,
        name: membership.user.name,
        email: membership.user.email,
        role: membership.role,
        suspended: membership.suspended,
        tokensUsed: membership.tokensUsed,
        spendUsedCents: membership.spendUsedCents,
        joinedAt: membership.createdAt,
      })),
      // Connection state only. Provider credentials are never decrypted for
      // platform staff.
      providers: organization.providers.map((provider) => ({
        provider: provider.provider,
        defaultModel: provider.defaultModel,
        enabledModels: provider.enabledModels,
        connectedAt: provider.connectedAt,
        connectedByName: provider.connectedBy?.name ?? null,
      })),
      usageByModel: usageByModel.map((entry) => ({
        provider: entry.provider,
        model: entry.model,
        requests: entry._count._all,
        promptTokens: entry._sum.promptTokens ?? 0,
        completionTokens: entry._sum.completionTokens ?? 0,
        estimatedCostCents: entry._sum.estimatedCostCents ?? 0,
      })),
      fileJobs: fileJobCounts,
      recentAudit,
    };
  }

  /**
   * StoredFile sits behind row-level security, so cross-tenant reads have to
   * opt into the SELECT-only platform policy.
   */
  private async countFileJobs(organizationId: string) {
    const grouped = await this.prisma.withPlatformRead((tx) =>
      tx.storedFile.groupBy({
        by: ['processingStatus'],
        where: { organizationId },
        _count: { _all: true },
      }),
    );

    const counts = Object.fromEntries(
      Object.values(FileProcessingStatus).map((status) => [status, 0]),
    ) as Record<FileProcessingStatus, number>;

    for (const entry of grouped) {
      counts[entry.processingStatus] = entry._count._all;
    }

    return counts;
  }
}
