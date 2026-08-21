import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SessionsModule } from '../sessions/sessions.module';
import { UsersModule } from '../users/users.module';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformCredentialsService } from './platform-credentials.service';
import { PlatformImpersonationController } from './platform-impersonation.controller';
import { PlatformImpersonationService } from './platform-impersonation.service';
import { PlatformOrganizationsController } from './platform-organizations.controller';
import { PlatformOrganizationsService } from './platform-organizations.service';
import { PlatformTokenService } from './platform-token.service';
import { PlatformJwtStrategy } from './strategies/platform-jwt.strategy';

@Module({
  imports: [
    PassportModule,
    UsersModule,
    SessionsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [
    PlatformAuthController,
    PlatformOrganizationsController,
    PlatformImpersonationController,
  ],
  providers: [
    PlatformJwtStrategy,
    PlatformTokenService,
    PlatformCredentialsService,
    PlatformAuthService,
    PlatformAuditService,
    PlatformOrganizationsService,
    PlatformImpersonationService,
  ],
  exports: [PlatformAuditService],
})
export class PlatformModule {}
