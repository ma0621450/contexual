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

  signAccessToken(user: AuthUser): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      hasMembership: user.memberships.length > 0,
      sessionVersion: user.sessionVersion,
    };

    return this.jwtService.sign(payload, {
      expiresIn: 15 * 60,
    });
  }

  setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    const refreshDays = Number(
      this.configService.get<string>('REFRESH_TOKEN_EXPIRY_DAYS') ?? 30,
    );
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: refreshDays * 24 * 60 * 60 * 1000,
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
    if (user.memberships.length === 0) {
      return '/onboarding';
    }
    return '/dashboard';
  }
}
