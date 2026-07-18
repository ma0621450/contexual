import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InviteStatus, MembershipRole, PlanTier } from '@contexual/database';
import type { Response } from 'express';
import { PrismaService } from '../database/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { getActiveMembership } from '../auth/auth.types';
import { generateUniqueOrganizationSlug } from './onboarding.utils';
import { getPlanLimits } from '../organizations/plan-limits';
import { SessionsService } from '../sessions/sessions.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
  ) {}

  async listOrganizations(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: {
        organization: {
          select: { id: true, name: true, slug: true, planTier: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((membership) => ({
      ...membership.organization,
      role: membership.role,
      suspended: membership.suspended,
    }));
  }

  async switchOrganization(
    user: AuthUser,
    organizationId: string,
    res: Response,
  ) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId } },
    });

    if (!membership) {
      throw new NotFoundException('Organization membership not found');
    }
    if (membership.suspended) {
      throw new ForbiddenException(
        'Your access to this organization is suspended',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { activeOrganizationId: organizationId },
    });
    const updatedUser = await this.usersService.findByIdWithMembershipsOrThrow(
      user.id,
    );
    this.sessionsService.refreshAccess(updatedUser, res);

    return { ok: true, redirectTo: '/dashboard' };
  }

  async transferAdmin(user: AuthUser, targetUserId: string, res: Response) {
    const organizationId = user.activeOrganizationId;
    if (!organizationId) {
      throw new BadRequestException('No active organization selected');
    }
    if (getActiveMembership(user)?.role !== MembershipRole.ADMIN) {
      throw new ForbiddenException('Only an admin can transfer admin access');
    }
    if (targetUserId === user.id) {
      throw new BadRequestException('Choose another member');
    }

    const target = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId: targetUserId, organizationId },
      },
    });
    if (!target || target.suspended) {
      throw new NotFoundException('Eligible member not found');
    }

    await this.prisma.$transaction([
      this.prisma.membership.update({
        where: { id: target.id },
        data: { role: MembershipRole.ADMIN },
      }),
      this.prisma.membership.update({
        where: {
          userId_organizationId: { userId: user.id, organizationId },
        },
        data: { role: MembershipRole.MEMBER },
      }),
    ]);
    const updatedUser = await this.usersService.findByIdWithMembershipsOrThrow(
      user.id,
    );
    this.sessionsService.refreshAccess(updatedUser, res);
    return { ok: true };
  }

  async leaveOrganization(user: AuthUser, res: Response) {
    const organizationId = user.activeOrganizationId;
    if (!organizationId) {
      throw new BadRequestException('No active organization selected');
    }
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId } },
    });
    if (!membership) throw new NotFoundException('Membership not found');

    if (membership.role === MembershipRole.ADMIN) {
      const otherAdmins = await this.prisma.membership.count({
        where: {
          organizationId,
          role: MembershipRole.ADMIN,
          suspended: false,
          userId: { not: user.id },
        },
      });
      if (otherAdmins === 0) {
        throw new ForbiddenException(
          'Transfer admin access before leaving this organization',
        );
      }
    }

    await this.prisma.membership.delete({ where: { id: membership.id } });
    const nextMembership = await this.prisma.membership.findFirst({
      where: { userId: user.id, suspended: false },
      orderBy: { createdAt: 'asc' },
    });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { activeOrganizationId: nextMembership?.organizationId ?? null },
    });
    const updatedUser = await this.usersService.findByIdWithMembershipsOrThrow(
      user.id,
    );
    this.sessionsService.refreshAccess(updatedUser, res);

    return {
      ok: true,
      redirectTo: nextMembership ? '/dashboard' : '/onboarding',
    };
  }

  async createOrganization(user: AuthUser, name: string, res: Response) {
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Email verification required');
    }

    const normalizedName = name.trim();

    const slug = await generateUniqueOrganizationSlug(
      normalizedName,
      async (candidate) => {
        const existing = await this.prisma.organization.findUnique({
          where: { slug: candidate },
        });
        return existing !== null;
      },
    );

    await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: normalizedName,
          slug,
          planTier: PlanTier.FREE,
        },
      });

      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: 'ADMIN',
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { activeOrganizationId: organization.id },
      });
    });

    const updatedUser = await this.usersService.findByIdWithMembershipsOrThrow(
      user.id,
    );
    await this.sessionsService.createSession(updatedUser, res);

    return { redirectTo: '/dashboard' };
  }

  async joinOrganization(user: AuthUser, token: string, res: Response) {
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Email verification required');
    }

    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: { organization: true },
    });

    if (!invite) {
      throw new NotFoundException('Invalid invite token');
    }

    if (invite.status !== InviteStatus.PENDING) {
      throw new ConflictException('This invite is no longer valid');
    }

    if (invite.expiresAt < new Date()) {
      await this.prisma.invite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.EXPIRED },
      });
      throw new ConflictException('This invite has expired');
    }

    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException(
        `This invitation was sent to ${invite.email}. Sign in with that email address to accept it.`,
      );
    }

    const existingMembership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: invite.organizationId,
        },
      },
    });

    if (existingMembership) {
      throw new ConflictException(
        'You are already a member of this organization',
      );
    }

    const maxMembers = getPlanLimits(invite.organization.planTier).maxMembers;

    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: invite.organizationId },
        data: { updatedAt: new Date() },
      });

      const currentInvite = await tx.invite.findUnique({
        where: { id: invite.id },
      });

      if (
        !currentInvite ||
        currentInvite.status !== InviteStatus.PENDING ||
        currentInvite.expiresAt < new Date()
      ) {
        throw new ConflictException('This invite is no longer valid');
      }

      const memberCount = await tx.membership.count({
        where: { organizationId: invite.organizationId },
      });

      if (memberCount >= maxMembers) {
        throw new ForbiddenException(
          'This organization has reached its member limit',
        );
      }

      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: invite.organizationId,
          role: invite.role,
        },
      });

      await tx.invite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.ACCEPTED },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { activeOrganizationId: invite.organizationId },
      });
    });

    const updatedUser = await this.usersService.findByIdWithMembershipsOrThrow(
      user.id,
    );
    await this.sessionsService.createSession(updatedUser, res);

    return {
      redirectTo: '/dashboard',
      organizationName: invite.organization.name,
    };
  }

  async getInvitePreview(token: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: {
        organization: {
          select: { id: true, name: true },
        },
      },
    });

    if (!invite) {
      throw new NotFoundException('Invalid invite token');
    }

    if (invite.status !== InviteStatus.PENDING) {
      throw new ConflictException('This invite is no longer valid');
    }

    if (invite.expiresAt < new Date()) {
      await this.prisma.invite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.EXPIRED },
      });
      throw new ConflictException('This invite has expired');
    }

    return {
      organizationId: invite.organization.id,
      organizationName: invite.organization.name,
      email: invite.email,
      role: invite.role,
    };
  }
}
