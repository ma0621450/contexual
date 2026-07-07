import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { OpenAiClient } from './openai.client';

@Module({
  imports: [ProvidersModule],
  controllers: [ChatController],
  providers: [ChatService, OpenAiClient],
})
export class ChatModule {}
