import { createHmac } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import {
  PLATFORM_ACCESS_TOKEN_COOKIE,
  PLATFORM_SESSION_MINUTES,
  PLATFORM_TOKEN_TYPE,
  type PlatformTokenPayload,
} from './platform.types';

/**
 * Derives the platform signing key from JWT_SECRET so platform and application
 * tokens are cryptographically distinct. A stolen application token cannot be
 * replayed against platform routes even if the type claim were forged, and no
 * additional secret has to be provisioned.
 */
export function derivePlatformSecret(jwtSecret: string): string {
  return createHmac('sha256', jwtSecret)
    .update('contexual:platform-session:v1')
    .digest('hex');
}

@Injectable()
export class PlatformTokenService {
  private readonly secret: string;

  constructor(
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.secret = derivePlatformSecret(
      configService.getOrThrow<string>('JWT_SECRET'),
    );
  }

  sign(payload: Omit<PlatformTokenPayload, 'typ'>): string {
    return this.jwtService.sign(
      { ...payload, typ: PLATFORM_TOKEN_TYPE },
      {
        secret: this.secret,
        expiresIn: PLATFORM_SESSION_MINUTES * 60,
      },
    );
  }

  getSecret(): string {
    return this.secret;
  }

  setCookie(res: Response, token: string) {
    res.cookie(PLATFORM_ACCESS_TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: PLATFORM_SESSION_MINUTES * 60 * 1000,
    });
  }

  clearCookie(res: Response) {
    res.clearCookie(PLATFORM_ACCESS_TOKEN_COOKIE, { path: '/' });
  }
}
