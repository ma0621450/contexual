import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InviteStatus, PlanTier } from '@contexual/database';
import type { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../database/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { generateUniqueOrganizationSlug } from './onboarding.utils';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async createOrganization(user: AuthUser, name: string, res: Response) {
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Email verification required');
    }

    const slug = await generateUniqueOrganizationSlug(
      name,
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
          name,
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

    const updatedUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { memberships: { select: { id: true } } },
    });

    await this.authService.issueSession(updatedUser, res);

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

    await this.prisma.$transaction(async (tx) => {
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

    const updatedUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { memberships: { select: { id: true } } },
    });

    await this.authService.issueSession(updatedUser, res);

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
          select: { name: true },
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
      throw new ConflictException('This invite has expired');
    }

    return {
      organizationName: invite.organization.name,
      email: invite.email,
      role: invite.role,
    };
  }
}
