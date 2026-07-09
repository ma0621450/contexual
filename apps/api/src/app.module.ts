import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { ChatModule } from './chat/chat.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { DatabaseModule } from './database/database.module';
import { MailModule } from './mail/mail.module';
import { MembersModule } from './members/members.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { ProvidersModule } from './providers/providers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CryptoModule,
    MailModule,
    AuditModule,
    DatabaseModule,
    AuthModule,
    OnboardingModule,
    MembersModule,
    ProvidersModule,
    ChatModule,
    BillingModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
