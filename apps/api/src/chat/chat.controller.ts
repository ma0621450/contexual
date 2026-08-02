import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/auth.types';
import { ActiveOrg } from '../common/decorators/active-org.decorator';
import { ChatService } from './chat.service';
import { RegenerateMessageDto, SendMessageDto } from './dto/chat.dto';

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
      attachmentIds: dto.attachmentIds,
    });
  }

  @Post('messages/stream')
  async streamMessage(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SendMessageDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const abortController = new AbortController();
    const abortUpstream = () => abortController.abort();
    req.once('aborted', abortUpstream);
    res.once('close', abortUpstream);

    const writeEvent = (payload: unknown) => {
      if (!res.destroyed) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    try {
      for await (const event of this.chatService.streamMessage(
        organizationId,
        user.id,
        {
          conversationId: dto.conversationId,
          content: dto.content,
          model: dto.model,
          attachmentIds: dto.attachmentIds,
        },
        abortController.signal,
      )) {
        writeEvent(event);
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        const message = this.getStreamErrorMessage(error);
        writeEvent({ type: 'error', message });
      }
    } finally {
      req.off('aborted', abortUpstream);
      res.off('close', abortUpstream);
    }

    if (!res.destroyed) res.end();
  }

  @Post('messages/regenerate/stream')
  async regenerateMessage(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RegenerateMessageDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const abortController = new AbortController();
    const abortUpstream = () => abortController.abort();
    req.once('aborted', abortUpstream);
    res.once('close', abortUpstream);

    const writeEvent = (payload: unknown) => {
      if (!res.destroyed) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    try {
      for await (const event of this.chatService.streamRegenerate(
        organizationId,
        user.id,
        {
          conversationId: dto.conversationId,
          assistantMessageId: dto.assistantMessageId,
          model: dto.model,
        },
        abortController.signal,
      )) {
        writeEvent(event);
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        const message = this.getStreamErrorMessage(error);
        writeEvent({ type: 'error', message });
      }
    } finally {
      req.off('aborted', abortUpstream);
      res.off('close', abortUpstream);
    }

    if (!res.destroyed) res.end();
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

  private getStreamErrorMessage(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (
        typeof response === 'object' &&
        response !== null &&
        'message' in response
      ) {
        const msg = (response as { message?: string | string[] }).message;
        if (Array.isArray(msg)) {
          return msg[0] ?? 'Request failed';
        }
        if (typeof msg === 'string') {
          return msg;
        }
      }
    }

    return 'Unable to complete the chat request';
  }
}
