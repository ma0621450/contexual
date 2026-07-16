import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { MemoriesModule } from '../memories/memories.module';
import { ProvidersModule } from '../providers/providers.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { AiProviderClient } from './ai-provider.client';
import { OpenAiClient } from './openai.client';
import { UsageReservationService } from './usage-reservation.service';

@Module({
  imports: [ProvidersModule, MemoriesModule, FilesModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    OpenAiClient,
    AiProviderClient,
    UsageReservationService,
  ],
})
export class ChatModule {}
