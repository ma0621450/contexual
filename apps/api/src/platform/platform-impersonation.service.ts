import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { AuthCookieService } from '../auth/auth-cookie.service';
import { generateRefreshToken, hashRefreshToken } from '../auth/auth.utils';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { UsersService } from '../users/users.service';
import { PlatformAuditService } from './platform-audit.service';
import type { PlatformAdminContext } from './platform.types';

const DEFAULT_DURATION_MINUTES = 30;
const REDEEM_WINDOW_MS = 2 * 60 * 1000;

@Injectable()
export class PlatformImpersonationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly authCookies: AuthCookieService,
    private readonly platformAudit: PlatformAuditService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async start(
    admin: PlatformAdminContext,
    input: {
      userId: string;
      organizationId: string;
      reason: string;
      durationMinutes?: number;
    },
    ipAddress: string | null,
  ) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: input.userId,
          organizationId: input.organizationId,
        },
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
        organization: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!membership) {
      throw new BadRequestException(
        'That user is not a member of the selected organization',
      );
    }

    // Staff and customer identities are separate tables, so the only link back
    // is the address. A staff member who also holds a customer account under
    // the same address must not be impersonated, by themselves or a colleague.
    const targetEmail = membership.user.email.trim().toLowerCase();

    if (targetEmail === admin.email.trim().toLowerCase()) {
      throw new BadRequestException('You cannot impersonate your own account');
    }

    const targetIsPlatformStaff = await this.prisma.platformAdmin.findUnique({
      where: { email: targetEmail },
      select: { id: true },
    });
    if (targetIsPlatformStaff) {
      throw new BadRequestException('Platform staff cannot be impersonated');
    }

    const durationMinutes = input.durationMinutes ?? DEFAULT_DURATION_MINUTES;
    const now = Date.now();
    const redeemToken = generateRefreshToken();

    const grant = await this.prisma.impersonationGrant.create({
      data: {
        platformAdminId: admin.id,
        targetUserId: membership.userId,
        targetOrganizationId: membership.organizationId,
        reason: input.reason.trim(),
        redeemTokenHash: hashRefreshToken(redeemToken),
        expiresAt: new Date(now + REDEEM_WINDOW_MS),
        endsAt: new Date(now + durationMinutes * 60 * 1000),
      },
    });

    await this.platformAudit.record({
      platformAdminId: admin.id,
      action: 'platform.impersonation_started',
      targetType: 'User',
      targetId: membership.userId,
      ipAddress,
      details: {
        grantId: grant.id,
        organizationId: membership.organizationId,
        organizationSlug: membership.organization.slug,
        targetEmail: membership.user.email,
        reason: grant.reason,
        durationMinutes,
      },
    });

    // Mirrored into the tenant's own audit feed so customers can see when
    // platform staff accessed their workspace.
    await this.audit.record({
      organizationId: membership.organizationId,
      actorId: null,
      action: 'organization.impersonation_started',
      details: {
        platformAdminEmail: admin.email,
        targetEmail: membership.user.email,
        reason: grant.reason,
        endsAt: grant.endsAt.toISOString(),
      },
    });

    const webUrl =
      this.config.get<string>('WEB_URL') ?? 'http://localhost:3000';
    return {
      grantId: grant.id,
      endsAt: grant.endsAt,
      redirectUrl: `${webUrl.replace(/\/$/, '')}/impersonate?token=${encodeURIComponent(redeemToken)}`,
      target: {
        userId: membership.user.id,
        email: membership.user.email,
        name: membership.user.name,
        organizationName: membership.organization.name,
      },
    };
  }

  async redeem(token: string, res: Response) {
    const grant = await this.prisma.impersonationGrant.findUnique({
      where: { redeemTokenHash: hashRefreshToken(token) },
      include: { platformAdmin: { select: { id: true, disabledAt: true } } },
    });

    const now = new Date();
    if (
      !grant ||
      grant.redeemedAt !== null ||
      grant.endedAt !== null ||
      grant.expiresAt < now ||
      grant.endsAt < now ||
      grant.platformAdmin.disabledAt !== null
    ) {
      throw new UnauthorizedException(
        'This impersonation link is invalid or has expired',
      );
    }

    const user = await this.users.findByIdWithMemberships(grant.targetUserId);
    if (!user) {
      throw new UnauthorizedException('Target user no longer exists');
    }

    await this.prisma.impersonationGrant.update({
      where: { id: grant.id },
      data: { redeemedAt: now },
    });

    const remainingSeconds = Math.max(
      30,
      Math.floor((grant.endsAt.getTime() - now.getTime()) / 1000),
    );

    const accessToken = this.authCookies.signImpersonationToken(
      user,
      {
        grantId: grant.id,
        platformAdminId: grant.platformAdminId,
        organizationId: grant.targetOrganizationId,
      },
      remainingSeconds,
    );

    this.authCookies.setAccessCookie(res, accessToken, remainingSeconds);
    // Drop any refresh token already in this browser so the support session
    // cannot be silently exchanged for a full-length one when it expires.
    this.authCookies.clearRefreshCookie(res);

    await this.platformAudit.record({
      platformAdminId: grant.platformAdminId,
      action: 'platform.impersonation_redeemed',
      targetType: 'User',
      targetId: grant.targetUserId,
      details: { grantId: grant.id },
    });

    return { ok: true, redirectTo: '/dashboard', endsAt: grant.endsAt };
  }

  async end(user: AuthUser, res: Response) {
    const claim = user.impersonation;
    if (!claim) {
      throw new BadRequestException('This session is not an impersonation');
    }

    await this.prisma.impersonationGrant.updateMany({
      where: { id: claim.grantId, endedAt: null },
      data: { endedAt: new Date() },
    });

    this.authCookies.clearAuthCookies(res);

    await this.platformAudit.record({
      platformAdminId: claim.platformAdminId,
      action: 'platform.impersonation_ended',
      targetType: 'User',
      targetId: user.id,
      details: { grantId: claim.grantId },
    });

    await this.audit.record({
      organizationId: claim.organizationId,
      actorId: null,
      action: 'organization.impersonation_ended',
      details: { targetEmail: user.email },
    });

    return { ok: true };
  }

  listRecent(limit = 50) {
    return this.prisma.impersonationGrant.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        reason: true,
        createdAt: true,
        redeemedAt: true,
        endsAt: true,
        endedAt: true,
        targetUser: { select: { email: true, name: true } },
        targetOrganization: { select: { name: true, slug: true } },
        platformAdmin: { select: { email: true } },
      },
    });
  }
}
