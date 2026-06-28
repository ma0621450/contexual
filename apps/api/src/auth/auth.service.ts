import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../database/prisma.service';
import { AuthCookieService } from './auth-cookie.service';
import {
  generateRefreshToken,
  hashPassword,
  hashRefreshToken,
  isOtpValid,
  verifyPassword,
} from './auth.utils';
import type { AuthUser } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authCookieService: AuthCookieService,
  ) {}

  async validateUser(email: string, password: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { memberships: { select: { id: true } } },
    });

    if (!user) {
      return null;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return null;
    }

    return user;
  }

  async register(
    name: string,
    email: string,
    password: string,
    res: Response,
  ) {
    const normalizedEmail = email.toLowerCase();

    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await hashPassword(password);

    const user = await this.prisma.user.create({
      data: { name, email: normalizedEmail, passwordHash },
      include: { memberships: { select: { id: true } } },
    });

    await this.createSession(user, res);

    return {
      redirectTo: '/verify-email',
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  async login(user: AuthUser, res: Response) {
    await this.createSession(user, res);

    return {
      redirectTo: this.authCookieService.getPostAuthRedirect(user),
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  async verifyEmail(user: AuthUser, otp: string, res: Response) {
    if (user.emailVerifiedAt) {
      return { redirectTo: '/onboarding' };
    }

    if (!isOtpValid(otp)) {
      throw new UnauthorizedException('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });

    const updatedUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { memberships: { select: { id: true } } },
    });

    await this.createSession(updatedUser, res);

    return { redirectTo: '/onboarding' };
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
          include: { memberships: { select: { id: true } } },
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

  getMe(user: AuthUser) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerifiedAt: user.emailVerifiedAt,
      memberships: user.memberships,
    };
  }

  async issueSession(user: AuthUser, res: Response) {
    await this.createSession(user, res);
  }

  private async createSession(user: AuthUser, res: Response) {
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

  private async revokeAllUserRefreshTokens(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
