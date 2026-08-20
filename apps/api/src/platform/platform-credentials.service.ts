import { Injectable } from '@nestjs/common';
import type { PlatformAdmin } from '@contexual/database';
import { hashPassword, verifyPassword } from '../auth/auth.utils';
import { PrismaService } from '../database/prisma.service';

/**
 * The only place that knows how a platform admin proves who they are.
 *
 * Everything downstream — the session token, guards, role hierarchy, audit log
 * and impersonation — consumes the resolved PlatformAdmin and is indifferent to
 * how it was resolved. Adopting an identity provider later means adding a
 * method here that returns the same row, with no changes elsewhere.
 */
@Injectable()
export class PlatformCredentialsService {
  constructor(private readonly prisma: PrismaService) {}

  async verify(email: string, password: string): Promise<PlatformAdmin | null> {
    const admin = await this.prisma.platformAdmin.findFirst({
      where: { email: normalizeEmail(email), disabledAt: null },
    });

    if (!admin) {
      // Spend a comparable amount of work so a missing account is not
      // distinguishable from a wrong password by response time.
      await hashPassword(password);
      return null;
    }

    const valid = await verifyPassword(password, admin.passwordHash);
    return valid ? admin : null;
  }

  matchesCurrentPassword(
    admin: PlatformAdmin,
    password: string,
  ): Promise<boolean> {
    return verifyPassword(password, admin.passwordHash);
  }

  async setPassword(
    platformAdminId: string,
    password: string,
  ): Promise<PlatformAdmin> {
    return this.prisma.platformAdmin.update({
      where: { id: platformAdminId },
      data: {
        passwordHash: await hashPassword(password),
        mustChangePassword: false,
      },
    });
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
