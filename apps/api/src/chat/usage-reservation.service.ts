import { randomUUID } from 'crypto';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { UsageReservationStatus, type Prisma } from '@contexual/database';
import { PrismaService } from '../database/prisma.service';
import { getPlanLimits } from '../organizations/plan-limits';
import type { ChatCompletionMessage } from './openai.client';
import { estimateCostCents } from './pricing';

const MAX_RESERVED_OUTPUT_TOKENS = 4096;
const RESERVATION_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class UsageReservationService {
  constructor(private readonly prisma: PrismaService) {}

  async reserve(input: {
    organizationId: string;
    membershipId: string;
    model: string;
    messages: ChatCompletionMessage[];
  }) {
    const estimatedPromptTokens = Math.ceil(
      input.messages.reduce((sum, message) => sum + message.content.length, 0) /
        4,
    );
    const reservedTokens = estimatedPromptTokens + MAX_RESERVED_OUTPUT_TOKENS;
    const reservedCostCents = estimateCostCents(
      input.model,
      estimatedPromptTokens,
      MAX_RESERVED_OUTPUT_TOKENS,
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "Organization"
        WHERE "id" = ${input.organizationId}
        FOR UPDATE
      `;

      const now = new Date();
      await tx.usageReservation.updateMany({
        where: {
          organizationId: input.organizationId,
          status: UsageReservationStatus.PENDING,
          expiresAt: { lt: now },
        },
        data: { status: UsageReservationStatus.RELEASED },
      });

      const [organization, membership, organizationPending, memberPending] =
        await Promise.all([
          tx.organization.findUniqueOrThrow({
            where: { id: input.organizationId },
            select: {
              planTier: true,
              monthlySpendLimitCents: true,
              monthlySpendUsedCents: true,
              monthlyTokenLimit: true,
              monthlyTokensUsed: true,
            },
          }),
          tx.membership.findFirstOrThrow({
            where: {
              id: input.membershipId,
              organizationId: input.organizationId,
              suspended: false,
            },
            select: {
              spendLimitCents: true,
              spendUsedCents: true,
              tokenLimit: true,
              tokensUsed: true,
            },
          }),
          this.pendingTotals(tx, {
            organizationId: input.organizationId,
          }),
          this.pendingTotals(tx, { membershipId: input.membershipId }),
        ]);

      this.assertWithinLimit(
        membership.tokensUsed + memberPending.tokens + reservedTokens,
        membership.tokenLimit,
        'This request would exceed your monthly token limit.',
      );
      this.assertWithinLimit(
        membership.spendUsedCents + memberPending.costCents + reservedCostCents,
        membership.spendLimitCents,
        'This request would exceed your monthly spend limit.',
      );
      this.assertWithinLimit(
        organization.monthlyTokensUsed +
          organizationPending.tokens +
          reservedTokens,
        organization.monthlyTokenLimit,
        'This request would exceed the organization token limit.',
      );
      this.assertWithinLimit(
        organization.monthlySpendUsedCents +
          organizationPending.costCents +
          reservedCostCents,
        organization.monthlySpendLimitCents,
        'This request would exceed the organization budget.',
      );

      const planTokenLimit = getPlanLimits(
        organization.planTier,
      ).maxMonthlyTokens;
      if (
        organization.monthlyTokensUsed +
          organizationPending.tokens +
          reservedTokens >
        planTokenLimit
      ) {
        throw new ForbiddenException(
          'This request would exceed the plan token allowance.',
        );
      }

      const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
      return tx.usageReservation.create({
        data: {
          organizationId: input.organizationId,
          membershipId: input.membershipId,
          requestId: randomUUID(),
          reservedTokens,
          reservedCostCents,
          expiresAt,
        },
        select: { id: true },
      });
    });
  }

  release(id: string) {
    return this.prisma.usageReservation.updateMany({
      where: { id, status: UsageReservationStatus.PENDING },
      data: { status: UsageReservationStatus.RELEASED },
    });
  }

  private async pendingTotals(
    tx: Prisma.TransactionClient,
    where: { organizationId?: string; membershipId?: string },
  ) {
    const aggregate = await tx.usageReservation.aggregate({
      where: { ...where, status: UsageReservationStatus.PENDING },
      _sum: { reservedTokens: true, reservedCostCents: true },
    });
    return {
      tokens: aggregate._sum.reservedTokens ?? 0,
      costCents: aggregate._sum.reservedCostCents ?? 0,
    };
  }

  private assertWithinLimit(
    projected: number,
    limit: number | null,
    message: string,
  ) {
    if (limit && limit > 0 && projected > limit) {
      throw new ForbiddenException(message);
    }
  }
}
