import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { ChatModule } from './chat/chat.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { DatabaseModule } from './database/database.module';
import { FilesModule } from './files/files.module';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { MemoriesModule } from './memories/memories.module';
import { MembersModule } from './members/members.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PlatformModule } from './platform/platform.module';
import { ProvidersModule } from './providers/providers.module';
import { ImpersonationInterceptor } from './common/interceptors/impersonation.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CryptoModule,
    MailModule,
    MemoriesModule,
    AuditModule,
    DatabaseModule,
    FilesModule,
    HealthModule,
    AuthModule,
    OnboardingModule,
    MembersModule,
    ProvidersModule,
    ChatModule,
    BillingModule,
    PlatformModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: ImpersonationInterceptor }],
})
export class AppModule {}
