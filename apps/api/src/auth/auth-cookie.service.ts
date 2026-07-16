import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  type AccessTokenPayload,
  type AuthUser,
} from './auth.types';

@Injectable()
export class AuthCookieService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  getRefreshTokenExpiry(): Date {
    const days = Number(
      this.configService.get<string>('REFRESH_TOKEN_EXPIRY_DAYS') ?? 30,
    );
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);
    return expiresAt;
  }

  private getAccessTokenExpirySeconds(): number {
    const configured =
      this.configService.get<string>('ACCESS_TOKEN_EXPIRY')?.trim() ?? '15m';
    const match = /^(\d+)(s|m|h|d)?$/i.exec(configured);

    if (!match) {
      return 15 * 60;
    }

    const value = Number(match[1]);
    const unit = match[2]?.toLowerCase() ?? 's';
    const multiplier =
      {
        s: 1,
        m: 60,
        h: 60 * 60,
        d: 24 * 60 * 60,
      }[unit] ?? 1;

    return value * multiplier;
  }

  signAccessToken(user: AuthUser): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      hasMembership: user.memberships.some(
        (membership) => !membership.suspended,
      ),
      sessionVersion: user.sessionVersion,
    };

    return this.jwtService.sign(payload, {
      expiresIn: this.getAccessTokenExpirySeconds(),
    });
  }

  setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    const refreshDays = Number(
      this.configService.get<string>('REFRESH_TOKEN_EXPIRY_DAYS') ?? 30,
    );
    const isProduction = process.env.NODE_ENV === 'production';

    this.setAccessCookie(res, accessToken);

    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: refreshDays * 24 * 60 * 60 * 1000,
    });
  }

  setAccessCookie(res: Response, accessToken: string) {
    const accessTokenExpirySeconds = this.getAccessTokenExpirySeconds();
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: accessTokenExpirySeconds * 1000,
    });
  }

  clearAuthCookies(res: Response) {
    res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
  }

  getPostAuthRedirect(user: AuthUser): string {
    if (!user.emailVerifiedAt) {
      return '/verify-email';
    }
    if (!user.memberships.some((membership) => !membership.suspended)) {
      return '/onboarding';
    }
    return '/dashboard';
  }
}
