import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { AuthCookieService } from '../auth/auth-cookie.service';
import { generateRefreshToken, hashRefreshToken } from '../auth/auth.utils';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authCookieService: AuthCookieService,
  ) {}

  async createSession(user: AuthUser, res: Response) {
    const refreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: this.authCookieService.getRefreshTokenExpiry(),
      },
    });

    const accessToken = this.authCookieService.signAccessToken(user);
    this.authCookieService.setAuthCookies(res, accessToken, refreshToken);
  }

  async refresh(refreshToken: string | undefined, res: Response) {
    if (!refreshToken) {
      throw new UnauthorizedException();
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            memberships: {
              select: { id: true, organizationId: true, role: true },
            },
          },
        },
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException();
    }

    if (storedToken.revokedAt) {
      await this.revokeAllUserRefreshTokens(storedToken.userId);
      this.authCookieService.clearAuthCookies(res);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (storedToken.expiresAt < new Date()) {
      await this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });
      this.authCookieService.clearAuthCookies(res);
      throw new UnauthorizedException('Refresh token expired');
    }

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    await this.createSession(storedToken.user, res);
    return { ok: true };
  }

  async logout(refreshToken: string | undefined, res: Response) {
    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    this.authCookieService.clearAuthCookies(res);
    return { ok: true };
  }

  async revokeAllUserRefreshTokens(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
