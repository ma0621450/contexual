import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/auth.types';
import { ActiveOrg } from '../common/decorators/active-org.decorator';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/chat.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  listConversations(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chatService.listConversations(organizationId, user.id);
  }

  @Get('conversations/:id')
  getConversation(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
  ) {
    return this.chatService.getConversation(
      organizationId,
      user.id,
      conversationId,
    );
  }

  @Post('messages')
  @HttpCode(200)
  sendMessage(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(organizationId, user.id, {
      conversationId: dto.conversationId,
      content: dto.content,
      model: dto.model,
    });
  }

  @Delete('conversations/:id')
  @HttpCode(200)
  archiveConversation(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
  ) {
    return this.chatService.archiveConversation(
      organizationId,
      user.id,
      conversationId,
    );
  }
}
