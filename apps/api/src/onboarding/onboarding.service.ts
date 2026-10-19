import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InviteStatus,
  MembershipRole,
  OrganizationType,
  PlanTier,
  Prisma,
  TeamSize,
} from '@contexual/database';
import type { Response } from 'express';
import { PrismaService } from '../database/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { getActiveMembership } from '../auth/auth.types';
import {
  generateOtp,
  hashPassword,
  verificationIdempotencyKey,
} from '../auth/auth.utils';
import {
  generateUniqueOrganizationSlug,
  getSlugProblem,
  SLUG_PROBLEM_MESSAGES,
} from './onboarding.utils';
import { verifyInviteEmailProof } from './invite-proof';
import { getPlanLimits } from '../organizations/plan-limits';
import { MailService } from '../mail/mail.service';
import { SessionsService } from '../sessions/sessions.service';
import { UsersService } from '../users/users.service';

type CreateOrganizationInput = {
  name: string;
  slug?: string;
  organizationType?: OrganizationType;
  teamSize?: TeamSize;
};

type InviteSignupInput = {
  token: string;
  proof?: string;
  name: string;
  password: string;
};

function isUniqueViolation(error: unknown, field: string): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === 'string') return target.includes(field);
  return true;
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
    private readonly mailService: MailService,
  ) {}

  private async isSlugTaken(slug: string): Promise<boolean> {
    const existing = await this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    return existing !== null;
  }

  async checkSlugAvailability(slug: string) {
    const problem = getSlugProblem(slug);
    if (problem) {
      return {
        slug,
        available: false,
        reason: problem,
        message: SLUG_PROBLEM_MESSAGES[problem],
      };
    }
    if (await this.isSlugTaken(slug)) {
      return {
        slug,
        available: false,
        reason: 'taken' as const,
        message: SLUG_PROBLEM_MESSAGES.taken,
      };
    }
    return { slug, available: true };
  }

  async suggestSlug(name: string) {
    const slug = await generateUniqueOrganizationSlug(name, (candidate) =>
      this.isSlugTaken(candidate),
    );
    return { slug };
  }

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

  async createOrganization(
    user: AuthUser,
    input: CreateOrganizationInput,
    res: Response,
  ) {
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Email verification required');
    }

    const normalizedName = input.name.trim();

    let slug: string;
    if (input.slug) {
      const problem = getSlugProblem(input.slug);
      if (problem) {
        throw new BadRequestException(SLUG_PROBLEM_MESSAGES[problem]);
      }
      slug = input.slug;
    } else {
      slug = await generateUniqueOrganizationSlug(normalizedName, (candidate) =>
        this.isSlugTaken(candidate),
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: {
            name: normalizedName,
            slug,
            organizationType: input.organizationType ?? null,
            teamSize: input.teamSize ?? null,
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
    } catch (error) {
      if (isUniqueViolation(error, 'slug')) {
        throw new ConflictException(SLUG_PROBLEM_MESSAGES.taken);
      }
      throw error;
    }

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

    const existingAccount = await this.prisma.user.findUnique({
      where: { email: invite.email.toLowerCase() },
      select: { id: true },
    });

    return {
      organizationId: invite.organization.id,
      organizationName: invite.organization.name,
      email: invite.email,
      role: invite.role,
      hasAccount: existingAccount !== null,
    };
  }

  /**
   * Creates an account for the invited email. The email is always taken from
   * the invite record. When the emailed proof is valid the account is created
   * verified and joins the organization in the same transaction; otherwise the
   * account must verify its email with a code before accepting.
   */
  async inviteSignup(input: InviteSignupInput, res: Response) {
    const invite = await this.prisma.invite.findUnique({
      where: { token: input.token },
      include: {
        organization: { select: { id: true, name: true, planTier: true } },
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

    const email = invite.email.toLowerCase();
    const existingAccount = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingAccount) {
      throw new ConflictException(
        'An account already exists for this email. Sign in to accept the invitation.',
      );
    }

    const emailProven = verifyInviteEmailProof(
      input.proof,
      invite.emailProofHash,
    );
    const passwordHash = await hashPassword(input.password);
    const maxMembers = getPlanLimits(invite.organization.planTier).maxMembers;

    let userId: string;
    try {
      userId = await this.prisma.$transaction(async (tx) => {
        if (!emailProven) {
          const created = await tx.user.create({
            data: { name: input.name, email, passwordHash },
            select: { id: true },
          });
          return created.id;
        }

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

        const created = await tx.user.create({
          data: {
            name: input.name,
            email,
            passwordHash,
            emailVerifiedAt: new Date(),
            activeOrganizationId: invite.organizationId,
          },
          select: { id: true },
        });

        await tx.membership.create({
          data: {
            userId: created.id,
            organizationId: invite.organizationId,
            role: invite.role,
          },
        });

        await tx.invite.update({
          where: { id: invite.id },
          data: { status: InviteStatus.ACCEPTED },
        });

        await tx.auditLog.create({
          data: {
            organizationId: invite.organizationId,
            actorId: created.id,
            action: 'invite.accepted',
            details: { inviteId: invite.id, email, role: invite.role },
          },
        });

        return created.id;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'email')) {
        throw new ConflictException(
          'An account already exists for this email. Sign in to accept the invitation.',
        );
      }
      throw error;
    }

    if (!emailProven) {
      const otp = generateOtp();
      await this.usersService.setEmailVerificationOtp(userId, otp);
      await this.mailService.sendVerificationOtp(
        email,
        input.name,
        otp,
        verificationIdempotencyKey(userId),
      );
    }

    const user = await this.usersService.findByIdWithMembershipsOrThrow(userId);
    await this.sessionsService.createSession(user, res);

    if (!emailProven) {
      const returnPath = `/onboarding?${new URLSearchParams({ invite: invite.token, accept: '1' }).toString()}`;
      return {
        joined: false,
        redirectTo: `/verify-email?from=${encodeURIComponent(returnPath)}`,
        organizationName: invite.organization.name,
      };
    }

    return {
      joined: true,
      redirectTo: '/dashboard',
      organizationName: invite.organization.name,
    };
  }
}
