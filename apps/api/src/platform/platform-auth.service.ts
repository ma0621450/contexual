import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { PlatformAdmin } from '@contexual/database';
import type { Response } from 'express';
import { EncryptionService } from '../common/crypto/encryption.service';
import { PrismaService } from '../database/prisma.service';
import { PlatformAuditService } from './platform-audit.service';
import {
  PlatformCredentialsService,
  normalizeEmail,
} from './platform-credentials.service';
import { PlatformTokenService } from './platform-token.service';
import type { PlatformAdminContext } from './platform.types';
import { buildOtpAuthUrl, generateTotpSecret, verifyTotp } from './totp.util';
import { RATE_LIMITS } from '../rate-limit/rate-limit.policies';
import { RateLimitService } from '../rate-limit/rate-limit.service';

@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: PlatformCredentialsService,
    private readonly encryption: EncryptionService,
    private readonly tokens: PlatformTokenService,
    private readonly audit: PlatformAuditService,
    private readonly rateLimits: RateLimitService,
  ) {}

  async login(
    email: string,
    password: string,
    totp: string | undefined,
    res: Response,
    ipAddress: string | null,
  ) {
    const key = normalizeEmail(email);
    await this.assertNotLockedOut(key, ipAddress);

    const admin = await this.credentials.verify(email, password);
    if (!admin) {
      await this.recordFailure(key);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!admin.totpConfirmedAt) {
      return {
        requiresTotpEnrollment: true as const,
        enrollment: await this.prepareEnrollment(admin),
      };
    }

    if (!totp || !this.verifyStoredTotp(admin, totp)) {
      await this.recordFailure(key);
      await this.audit.record({
        platformAdminId: admin.id,
        action: 'platform.login_failed',
        targetType: 'PlatformAdmin',
        targetId: admin.id,
        ipAddress,
        details: { reason: totp ? 'invalid_totp' : 'missing_totp' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.rateLimits.reset(RATE_LIMITS.platformLoginAccount, key);
    return this.issueSession(admin.id, res, ipAddress);
  }

  async confirmTotp(
    email: string,
    password: string,
    totp: string,
    res: Response,
    ipAddress: string | null,
  ) {
    const key = normalizeEmail(email);
    await this.assertNotLockedOut(key, ipAddress);

    const admin = await this.credentials.verify(email, password);
    if (!admin || admin.totpConfirmedAt) {
      await this.recordFailure(key);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!this.verifyStoredTotp(admin, totp)) {
      await this.recordFailure(key);
      throw new UnauthorizedException('Invalid authentication code');
    }

    await this.prisma.platformAdmin.update({
      where: { id: admin.id },
      data: { totpConfirmedAt: new Date() },
    });

    await this.rateLimits.reset(RATE_LIMITS.platformLoginAccount, key);
    await this.audit.record({
      platformAdminId: admin.id,
      action: 'platform.totp_enrolled',
      targetType: 'PlatformAdmin',
      targetId: admin.id,
      ipAddress,
    });

    return this.issueSession(admin.id, res, ipAddress);
  }

  /**
   * Rotation for seeded and reset accounts. Requires the current password so a
   * momentarily unattended session cannot be used to lock out its owner.
   */
  async changePassword(
    context: PlatformAdminContext,
    currentPassword: string,
    newPassword: string,
    ipAddress: string | null,
  ) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: context.id },
    });

    if (!admin || admin.disabledAt) {
      throw new UnauthorizedException();
    }

    if (
      !(await this.credentials.matchesCurrentPassword(admin, currentPassword))
    ) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (await this.credentials.matchesCurrentPassword(admin, newPassword)) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    await this.credentials.setPassword(admin.id, newPassword);
    await this.audit.record({
      platformAdminId: admin.id,
      action: 'platform.password_changed',
      targetType: 'PlatformAdmin',
      targetId: admin.id,
      ipAddress,
    });

    return { ok: true };
  }

  async logout(
    admin: PlatformAdminContext | null,
    res: Response,
    ipAddress: string | null,
  ) {
    this.tokens.clearCookie(res);
    if (admin) {
      await this.audit.record({
        platformAdminId: admin.id,
        action: 'platform.logout',
        ipAddress,
      });
    }
    return { ok: true };
  }

  private async issueSession(
    platformAdminId: string,
    res: Response,
    ipAddress: string | null,
  ) {
    const admin = await this.prisma.platformAdmin.update({
      where: { id: platformAdminId },
      data: { lastLoginAt: new Date() },
    });

    const token = this.tokens.sign({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
    });
    this.tokens.setCookie(res, token);

    await this.audit.record({
      platformAdminId: admin.id,
      action: 'platform.login',
      targetType: 'PlatformAdmin',
      targetId: admin.id,
      ipAddress,
    });

    return {
      requiresTotpEnrollment: false as const,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        mustChangePassword: admin.mustChangePassword,
      },
    };
  }

  /**
   * Returns the existing unconfirmed secret when one is present so a staff
   * member can finish a partially completed enrollment without re-scanning.
   */
  private async prepareEnrollment(admin: PlatformAdmin) {
    let secret: string;

    if (admin.totpSecretCiphertext && admin.totpSecretIv) {
      secret = this.encryption.decrypt({
        ciphertext: admin.totpSecretCiphertext,
        iv: admin.totpSecretIv,
      });
    } else {
      secret = generateTotpSecret();
      const encrypted = this.encryption.encrypt(secret);
      await this.prisma.platformAdmin.update({
        where: { id: admin.id },
        data: {
          totpSecretCiphertext: encrypted.ciphertext,
          totpSecretIv: encrypted.iv,
        },
      });
    }

    return {
      secret,
      otpauthUrl: buildOtpAuthUrl(secret, admin.email, 'PromplexAI Platform'),
    };
  }

  private verifyStoredTotp(
    admin: { totpSecretCiphertext: string | null; totpSecretIv: string | null },
    totp: string,
  ): boolean {
    if (!admin.totpSecretCiphertext || !admin.totpSecretIv) return false;
    try {
      const secret = this.encryption.decrypt({
        ciphertext: admin.totpSecretCiphertext,
        iv: admin.totpSecretIv,
      });
      return verifyTotp(secret, totp);
    } catch {
      return false;
    }
  }

  private async assertNotLockedOut(key: string, ipAddress: string | null) {
    await this.rateLimits.consume(
      RATE_LIMITS.platformLoginIp,
      ipAddress ?? 'unknown',
    );
    await this.rateLimits.assertAvailable(
      RATE_LIMITS.platformLoginAccount,
      key,
    );
  }

  private async recordFailure(key: string) {
    await this.rateLimits.hit(RATE_LIMITS.platformLoginAccount, key);
  }
}
