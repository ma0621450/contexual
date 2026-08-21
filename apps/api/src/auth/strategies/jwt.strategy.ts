import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  ACCESS_TOKEN_COOKIE,
  type AccessTokenPayload,
  type AuthUser,
} from '../auth.types';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          const rawToken: unknown = req.cookies?.[ACCESS_TOKEN_COOKIE];
          return typeof rawToken === 'string' ? rawToken : null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    const user = await this.usersService.findByIdWithMemberships(payload.sub);

    if (!user || user.sessionVersion !== payload.sessionVersion) {
      throw new UnauthorizedException();
    }

    if (!payload.impersonation) {
      return user;
    }

    const grant = await this.prisma.impersonationGrant.findUnique({
      where: { id: payload.impersonation.grantId },
      select: {
        targetUserId: true,
        targetOrganizationId: true,
        endedAt: true,
        endsAt: true,
      },
    });

    if (
      !grant ||
      grant.endedAt !== null ||
      grant.endsAt < new Date() ||
      grant.targetUserId !== user.id ||
      grant.targetOrganizationId !== payload.impersonation.organizationId
    ) {
      throw new UnauthorizedException('Impersonation session has ended');
    }

    // Scope the session to the impersonated organization without mutating the
    // user's own stored active organization.
    return {
      ...user,
      activeOrganizationId: grant.targetOrganizationId,
      impersonation: payload.impersonation,
    };
  }
}
