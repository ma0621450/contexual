import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InviteStatus, MembershipRole, PlanTier } from '@contexual/database';
import { AuditService } from '../audit/audit.service';
import { getUtcMonthStart } from '../common/usage/usage-period';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../database/prisma.service';
import { getPlanLimits } from '../organizations/plan-limits';

const INVITE_EXPIRY_DAYS = 7;

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
  ) {}

  private webUrl(): string {
    return this.config.get<string>('WEB_URL') ?? 'http://localhost:3000';
  }

  async getOverview(organizationId: string) {
    await this.expireStaleInvites(organizationId);

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true, planTier: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const maxMembers = getPlanLimits(organization.planTier).maxMembers;

    const [memberCount, pendingInvites] = await Promise.all([
      this.prisma.membership.count({ where: { organizationId } }),
      this.prisma.invite.count({
        where: { organizationId, status: InviteStatus.PENDING },
      }),
    ]);

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      planTier: organization.planTier,
      maxMembers,
      memberCount,
      pendingInvites,
      seatsRemaining: Math.max(maxMembers - memberCount - pendingInvites, 0),
    };
  }

  async listMembers(organizationId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((membership) => ({
      membershipId: membership.id,
      userId: membership.userId,
      name: membership.user.name,
      email: membership.user.email,
      role: membership.role,
      suspended: membership.suspended,
      joinedAt: membership.createdAt,
    }));
  }

  async listInvites(organizationId: string) {
    await this.expireStaleInvites(organizationId);

    const invites = await this.prisma.invite.findMany({
      where: { organizationId, status: InviteStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });

    return invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      token: invite.token,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    }));
  }

  async createInvite(
    organizationId: string,
    invitedById: string,
    email: string,
    role: MembershipRole = MembershipRole.MEMBER,
  ) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const normalizedEmail = email.toLowerCase();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

    const invite = await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organizationId },
        data: { updatedAt: new Date() },
      });

      await tx.invite.updateMany({
        where: {
          organizationId,
          status: InviteStatus.PENDING,
          expiresAt: { lt: new Date() },
        },
        data: { status: InviteStatus.EXPIRED },
      });

      const [existingMember, existingInvite, memberCount, pendingInvites] =
        await Promise.all([
          tx.membership.findFirst({
            where: { organizationId, user: { email: normalizedEmail } },
          }),
          tx.invite.findFirst({
            where: {
              organizationId,
              email: normalizedEmail,
              status: InviteStatus.PENDING,
            },
          }),
          tx.membership.count({ where: { organizationId } }),
          tx.invite.count({
            where: { organizationId, status: InviteStatus.PENDING },
          }),
        ]);

      if (existingMember) {
        throw new ConflictException(
          'This person is already a member of the organization',
        );
      }

      if (existingInvite) {
        throw new ConflictException(
          'An invitation is already pending for this email',
        );
      }

      const maxMembers = getPlanLimits(organization.planTier).maxMembers;
      if (memberCount + pendingInvites >= maxMembers) {
        throw new ForbiddenException(
          `Your plan allows up to ${maxMembers} members. Upgrade your plan to invite more.`,
        );
      }

      return tx.invite.create({
        data: {
          email: normalizedEmail,
          organizationId,
          role,
          token: randomBytes(32).toString('base64url'),
          invitedById,
          expiresAt,
        },
      });
    });

    await this.auditService.record({
      organizationId,
      actorId: invitedById,
      action: 'invite.created',
      details: { email: normalizedEmail, role },
    });

    const inviter = await this.prisma.user.findUnique({
      where: { id: invitedById },
      select: { name: true },
    });

    await this.mailService.sendTeamInvite({
      to: normalizedEmail,
      organizationName: organization.name,
      inviterName: inviter?.name ?? 'A team admin',
      inviteUrl: `${this.webUrl()}/onboarding?invite=${invite.token}`,
      idempotencyKey: `team-invite:${invite.id}`,
    });

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      token: invite.token,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    };
  }

  async revokeInvite(
    organizationId: string,
    actingUserId: string,
    inviteId: string,
  ) {
    const invite = await this.prisma.invite.findUnique({
      where: { id: inviteId },
    });

    if (!invite || invite.organizationId !== organizationId) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.status !== InviteStatus.PENDING) {
      throw new ConflictException('This invite is no longer pending');
    }

    await this.prisma.invite.update({
      where: { id: inviteId },
      data: { status: InviteStatus.REVOKED },
    });

    await this.auditService.record({
      organizationId,
      actorId: actingUserId,
      action: 'invite.revoked',
      details: { email: invite.email },
    });

    return { ok: true };
  }

  async changeRole(
    organizationId: string,
    actingUserId: string,
    targetUserId: string,
    role: MembershipRole,
  ) {
    const membership = await this.getMembershipOrThrow(
      organizationId,
      targetUserId,
    );

    if (membership.role === role) {
      return { ok: true };
    }

    if (
      membership.role === MembershipRole.ADMIN &&
      role === MembershipRole.MEMBER
    ) {
      await this.assertNotLastAdmin(organizationId, targetUserId);
    }

    await this.prisma.membership.update({
      where: { id: membership.id },
      data: { role },
    });

    await this.auditService.record({
      organizationId,
      actorId: actingUserId,
      action: 'member.role_changed',
      details: { targetUserId, role },
    });

    return { ok: true };
  }

  async removeMember(
    organizationId: string,
    actingUserId: string,
    targetUserId: string,
  ) {
    if (actingUserId === targetUserId) {
      throw new BadRequestException(
        'You cannot remove yourself from the organization',
      );
    }

    const membership = await this.getMembershipOrThrow(
      organizationId,
      targetUserId,
    );

    if (membership.role === MembershipRole.ADMIN) {
      await this.assertNotLastAdmin(organizationId, targetUserId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.membership.delete({ where: { id: membership.id } });

      await tx.user.updateMany({
        where: { id: targetUserId, activeOrganizationId: organizationId },
        data: { activeOrganizationId: null },
      });

      await tx.user.update({
        where: { id: targetUserId },
        data: { sessionVersion: { increment: 1 } },
      });
    });

    await this.auditService.record({
      organizationId,
      actorId: actingUserId,
      action: 'member.removed',
      details: { targetUserId },
    });

    return { ok: true };
  }

  async suspendMember(
    organizationId: string,
    actingUserId: string,
    targetUserId: string,
    suspended: boolean,
  ) {
    if (actingUserId === targetUserId) {
      throw new BadRequestException('You cannot suspend your own access');
    }

    const membership = await this.getMembershipOrThrow(
      organizationId,
      targetUserId,
    );

    if (membership.suspended === suspended) {
      return { ok: true };
    }

    if (suspended && membership.role === MembershipRole.ADMIN) {
      await this.assertNotLastAdmin(organizationId, targetUserId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.membership.update({
        where: { id: membership.id },
        data: { suspended },
      });

      await tx.user.update({
        where: { id: targetUserId },
        data: { sessionVersion: { increment: 1 } },
      });
    });

    await this.auditService.record({
      organizationId,
      actorId: actingUserId,
      action: suspended ? 'member.suspended' : 'member.reinstated',
      details: { targetUserId },
    });

    return { ok: true };
  }

  async changePlan(
    organizationId: string,
    actingUserId: string,
    planTier: PlanTier,
  ) {
    if (this.config.get<string>('STRIPE_SECRET_KEY')) {
      throw new BadRequestException(
        'Plan changes are managed through billing. Use Upgrade or Manage billing on the Usage page.',
      );
    }

    const maxMembers = getPlanLimits(planTier).maxMembers;

    await this.expireStaleInvites(organizationId);
    const [currentMembers, pendingInvites] = await Promise.all([
      this.prisma.membership.count({
        where: { organizationId },
      }),
      this.prisma.invite.count({
        where: { organizationId, status: InviteStatus.PENDING },
      }),
    ]);

    if (currentMembers + pendingInvites > maxMembers) {
      throw new BadRequestException(
        `This plan allows ${maxMembers} seats but the organization has ${currentMembers} members and ${pendingInvites} pending invites. Remove members or revoke invites before downgrading.`,
      );
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { planTier, maxMembers },
    });

    await this.auditService.record({
      organizationId,
      actorId: actingUserId,
      action: 'plan.changed',
      details: { planTier, maxMembers },
    });

    return { ok: true, planTier, maxMembers };
  }

  async setSpendLimit(
    organizationId: string,
    actingUserId: string,
    targetUserId: string,
    limitCents: number,
  ) {
    const membership = await this.getMembershipOrThrow(
      organizationId,
      targetUserId,
    );

    await this.prisma.membership.update({
      where: { id: membership.id },
      data: { spendLimitCents: limitCents },
    });

    await this.auditService.record({
      organizationId,
      actorId: actingUserId,
      action: 'member.spend_limit_set',
      details: { targetUserId, limitCents },
    });

    return { ok: true, limitCents };
  }

  async setTokenLimit(
    organizationId: string,
    actingUserId: string,
    targetUserId: string,
    tokenLimit: number,
  ) {
    const membership = await this.getMembershipOrThrow(
      organizationId,
      targetUserId,
    );

    await this.prisma.membership.update({
      where: { id: membership.id },
      data: { tokenLimit },
    });
    await this.auditService.record({
      organizationId,
      actorId: actingUserId,
      action: 'member.token_limit_set',
      details: { targetUserId, tokenLimit },
    });

    return { ok: true, tokenLimit };
  }

  async setOrganizationLimits(
    organizationId: string,
    actingUserId: string,
    input: { monthlySpendLimitCents: number; monthlyTokenLimit: number },
  ) {
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: input,
    });
    await this.auditService.record({
      organizationId,
      actorId: actingUserId,
      action: 'organization.usage_limits_set',
      details: input,
    });

    return { ok: true, ...input };
  }

  async getUsage(organizationId: string) {
    const spendPeriodStartedAt =
      await this.resetStaleSpendPeriods(organizationId);

    const [aggregate, perMember, memberships, organization] = await Promise.all(
      [
        this.prisma.usageLog.aggregate({
          where: { organizationId, createdAt: { gte: spendPeriodStartedAt } },
          _sum: {
            promptTokens: true,
            completionTokens: true,
            estimatedCostCents: true,
          },
        }),
        this.prisma.usageLog.groupBy({
          by: ['userId'],
          where: { organizationId, createdAt: { gte: spendPeriodStartedAt } },
          _sum: {
            promptTokens: true,
            completionTokens: true,
            estimatedCostCents: true,
          },
        }),
        this.prisma.membership.findMany({
          where: { organizationId },
          include: { user: { select: { id: true, name: true, email: true } } },
        }),
        this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: {
            monthlySpendLimitCents: true,
            monthlySpendUsedCents: true,
            monthlyTokenLimit: true,
            monthlyTokensUsed: true,
          },
        }),
      ],
    );

    const usageByUser = new Map(perMember.map((row) => [row.userId, row._sum]));

    return {
      spendPeriodStartedAt,
      organizationLimits: organization,
      totals: {
        promptTokens: aggregate._sum.promptTokens ?? 0,
        completionTokens: aggregate._sum.completionTokens ?? 0,
        estimatedCostCents: aggregate._sum.estimatedCostCents ?? 0,
      },
      members: memberships.map((membership) => {
        const usage = usageByUser.get(membership.userId);
        return {
          userId: membership.userId,
          name: membership.user.name,
          email: membership.user.email,
          role: membership.role,
          suspended: membership.suspended,
          spendLimitCents: membership.spendLimitCents,
          spendUsedCents: membership.spendUsedCents,
          tokenLimit: membership.tokenLimit,
          tokensUsed: membership.tokensUsed,
          promptTokens: usage?.promptTokens ?? 0,
          completionTokens: usage?.completionTokens ?? 0,
          estimatedCostCents: usage?.estimatedCostCents ?? 0,
        };
      }),
    };
  }

  async getMyUsage(organizationId: string, userId: string) {
    const spendPeriodStartedAt =
      await this.resetStaleSpendPeriods(organizationId);

    const [aggregate, membership, organization] = await Promise.all([
      this.prisma.usageLog.aggregate({
        where: {
          organizationId,
          userId,
          createdAt: { gte: spendPeriodStartedAt },
        },
        _sum: {
          promptTokens: true,
          completionTokens: true,
          estimatedCostCents: true,
        },
      }),
      this.prisma.membership.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
        select: {
          spendLimitCents: true,
          spendUsedCents: true,
          tokenLimit: true,
          tokensUsed: true,
          suspended: true,
        },
      }),
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
          monthlySpendLimitCents: true,
          monthlySpendUsedCents: true,
          monthlyTokenLimit: true,
          monthlyTokensUsed: true,
        },
      }),
    ]);

    if (!membership || membership.suspended) {
      throw new ForbiddenException(
        'You do not have active access to this organization',
      );
    }

    return {
      spendPeriodStartedAt,
      usage: {
        promptTokens: aggregate._sum.promptTokens ?? 0,
        completionTokens: aggregate._sum.completionTokens ?? 0,
        estimatedCostCents: aggregate._sum.estimatedCostCents ?? 0,
        tokensUsed: membership.tokensUsed,
        spendUsedCents: membership.spendUsedCents,
      },
      limits: {
        spendLimitCents: membership.spendLimitCents,
        tokenLimit: membership.tokenLimit,
      },
      organizationLimits: organization,
    };
  }

  async listAuditLogs(organizationId: string) {
    const logs = await this.auditService.list(organizationId);

    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      details: log.details,
      actorName: log.actor?.name ?? null,
      actorEmail: log.actor?.email ?? null,
      createdAt: log.createdAt,
    }));
  }

  private async getMembershipOrThrow(organizationId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });

    if (!membership) {
      throw new NotFoundException('Member not found in this organization');
    }

    return membership;
  }

  private async assertNotLastAdmin(organizationId: string, userId: string) {
    const otherAdmins = await this.prisma.membership.count({
      where: {
        organizationId,
        role: MembershipRole.ADMIN,
        suspended: false,
        userId: { not: userId },
      },
    });

    if (otherAdmins === 0) {
      throw new ForbiddenException(
        'The organization must have at least one admin',
      );
    }
  }

  private async expireStaleInvites(organizationId: string) {
    await this.prisma.invite.updateMany({
      where: {
        organizationId,
        status: InviteStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
      data: { status: InviteStatus.EXPIRED },
    });
  }

  private async resetStaleSpendPeriods(organizationId: string) {
    const currentPeriodStart = getUtcMonthStart();

    await this.prisma.membership.updateMany({
      where: {
        organizationId,
        spendPeriodStartedAt: { lt: currentPeriodStart },
      },
      data: {
        spendUsedCents: 0,
        tokensUsed: 0,
        spendPeriodStartedAt: currentPeriodStart,
      },
    });

    await this.prisma.organization.updateMany({
      where: {
        id: organizationId,
        usagePeriodStartedAt: { lt: currentPeriodStart },
      },
      data: {
        monthlySpendUsedCents: 0,
        monthlyTokensUsed: 0,
        usagePeriodStartedAt: currentPeriodStart,
      },
    });

    return currentPeriodStart;
  }
}
