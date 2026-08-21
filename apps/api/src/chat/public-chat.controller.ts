import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat/public')
export class PublicChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get(':token')
  async getPublicConversation(@Param('token') token: string) {
    if (!token?.trim()) {
      throw new NotFoundException('Shared conversation not found');
    }
    return this.chatService.getPublicConversation(token.trim());
  }
}
