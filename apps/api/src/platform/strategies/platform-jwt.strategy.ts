import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../database/prisma.service';
import { derivePlatformSecret } from '../platform-token.service';
import {
  PLATFORM_ACCESS_TOKEN_COOKIE,
  PLATFORM_TOKEN_TYPE,
  type PlatformAdminContext,
  type PlatformTokenPayload,
} from '../platform.types';

export const PLATFORM_JWT_STRATEGY = 'platform-jwt';

@Injectable()
export class PlatformJwtStrategy extends PassportStrategy(
  Strategy,
  PLATFORM_JWT_STRATEGY,
) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          const rawToken: unknown = req.cookies?.[PLATFORM_ACCESS_TOKEN_COOKIE];
          return typeof rawToken === 'string' ? rawToken : null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: derivePlatformSecret(
        configService.getOrThrow<string>('JWT_SECRET'),
      ),
    });
  }

  async validate(payload: PlatformTokenPayload): Promise<PlatformAdminContext> {
    if (payload.typ !== PLATFORM_TOKEN_TYPE) {
      throw new UnauthorizedException();
    }

    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: payload.sub },
    });

    if (!admin || admin.disabledAt || !admin.totpConfirmedAt) {
      throw new UnauthorizedException();
    }

    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      mustChangePassword: admin.mustChangePassword,
    };
  }
}
