import { Global, Module } from '@nestjs/common';
import { EmailDeliveryService } from './email-delivery.service';
import { EmailOutboxProcessorService } from './email-outbox-processor.service';
import { MailService } from './mail.service';

@Global()
@Module({
  providers: [MailService, EmailDeliveryService, EmailOutboxProcessorService],
  exports: [MailService, EmailOutboxProcessorService],
})
export class MailModule {}
