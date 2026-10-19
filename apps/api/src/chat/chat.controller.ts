import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Param,
  Patch,
  Post,
  Query,
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
import {
  CreateFolderDto,
  EditMessageDto,
  MessageFeedbackDto,
  RegenerateMessageDto,
  RenameConversationDto,
  SendMessageDto,
  UpdateConversationDto,
  UpdateFolderDto,
  ShareConversationDto,
  RunSandboxDto,
} from './dto/chat.dto';
import { CodeSandboxService } from './code-sandbox.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly sandbox: CodeSandboxService,
  ) {}

  @Get('conversations')
  listConversations(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Query('q') query?: string,
    @Query('archived') archived?: string,
  ) {
    return this.chatService.listConversations(
      organizationId,
      user.id,
      query,
      archived === 'true',
    );
  }

  @Get('folders')
  listFolders(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chatService.listFolders(organizationId, user.id);
  }

  @Post('folders')
  createFolder(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFolderDto,
  ) {
    return this.chatService.createFolder(organizationId, user.id, dto.name);
  }

  @Patch('folders/:id')
  updateFolder(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') folderId: string,
    @Body() dto: UpdateFolderDto,
  ) {
    return this.chatService.updateFolder(organizationId, user.id, folderId, dto);
  }

  @Delete('folders/:id')
  @HttpCode(200)
  deleteFolder(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') folderId: string,
  ) {
    return this.chatService.deleteFolder(organizationId, user.id, folderId);
  }

  @Get('shared/:token')
  getSharedConversation(
    @ActiveOrg() organizationId: string,
    @Param('token') token: string,
  ) {
    return this.chatService.getSharedConversation(organizationId, token);
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
          webSearch: dto.webSearch,
          compareModel: dto.compareModel,
          parentMessageId: dto.parentMessageId,
          folderId: dto.folderId,
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

  @Patch('conversations/:id')
  updateConversation(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Body() dto: UpdateConversationDto | RenameConversationDto,
  ) {
    if ('title' in dto && dto.title && !('pinned' in dto) && Object.keys(dto).length === 1) {
      return this.chatService.renameConversation(
        organizationId,
        user.id,
        conversationId,
        dto.title,
      );
    }
    return this.chatService.updateConversation(
      organizationId,
      user.id,
      conversationId,
      dto,
    );
  }

  @Post('conversations/:id/restore')
  @HttpCode(200)
  restoreConversation(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
  ) {
    return this.chatService.restoreConversation(
      organizationId,
      user.id,
      conversationId,
    );
  }

  @Post('conversations/:id/share')
  shareConversation(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Body() dto: ShareConversationDto,
  ) {
    return this.chatService.shareConversation(
      organizationId,
      user.id,
      conversationId,
      dto?.expiresIn,
    );
  }

  @Delete('conversations/:id/share')
  @HttpCode(200)
  unshareConversation(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
  ) {
    return this.chatService.unshareConversation(
      organizationId,
      user.id,
      conversationId,
    );
  }

  @Post('messages/:id/select')
  @HttpCode(200)
  selectMessageBranch(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') messageId: string,
  ) {
    return this.chatService.selectMessageBranch(
      organizationId,
      user.id,
      messageId,
    );
  }

  @Post('messages/:id/pick-compare')
  @HttpCode(200)
  pickCompareWinner(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') messageId: string,
  ) {
    return this.chatService.pickCompareWinner(
      organizationId,
      user.id,
      messageId,
    );
  }

  @Post('messages/:id/merge-compare')
  @HttpCode(200)
  mergeCompareResponses(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') messageId: string,
  ) {
    return this.chatService.mergeCompareResponses(
      organizationId,
      user.id,
      messageId,
    );
  }

  @Delete('messages/:id')
  @HttpCode(200)
  deleteMessage(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') messageId: string,
  ) {
    return this.chatService.deleteMessage(organizationId, user.id, messageId);
  }

  @Patch('messages/:id/feedback')
  setMessageFeedback(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') messageId: string,
    @Body() dto: MessageFeedbackDto,
  ) {
    return this.chatService.setMessageFeedback(
      organizationId,
      user.id,
      messageId,
      dto.rating,
    );
  }

  @Post('messages/:id/edit/stream')
  async editMessageStream(
    @ActiveOrg() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') messageId: string,
    @Body() dto: EditMessageDto,
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
      for await (const event of this.chatService.streamEditMessage(
        organizationId,
        user.id,
        messageId,
        dto.content,
        dto.model,
        abortController.signal,
      )) {
        writeEvent(event);
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        writeEvent({ type: 'error', message: this.getStreamErrorMessage(error) });
      }
    } finally {
      req.off('aborted', abortUpstream);
      res.off('close', abortUpstream);
    }

    if (!res.destroyed) res.end();
  }

  @Post('sandbox')
  @HttpCode(200)
  runSandbox(@Body() dto: RunSandboxDto) {
    return this.sandbox.run(dto.language, dto.code);
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
