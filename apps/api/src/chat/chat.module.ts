import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { MemoriesModule } from '../memories/memories.module';
import { ProvidersModule } from '../providers/providers.module';
import { ChatController } from './chat.controller';
import { PublicChatController } from './public-chat.controller';
import { ChatService } from './chat.service';
import { AiProviderClient } from './ai-provider.client';
import { OpenAiClient } from './openai.client';
import { ChatAgentService } from './chat-agent.service';
import { UsageReservationService } from './usage-reservation.service';
import { WebSearchService } from './web-search.service';
import { CodeSandboxService } from './code-sandbox.service';
import { SpeechService } from './speech.service';

@Module({
  imports: [ProvidersModule, MemoriesModule, FilesModule],
  controllers: [ChatController, PublicChatController],
  providers: [
    ChatService,
    OpenAiClient,
    AiProviderClient,
    UsageReservationService,
    WebSearchService,
    ChatAgentService,
    CodeSandboxService,
    SpeechService,
  ],
})
export class ChatModule {}
