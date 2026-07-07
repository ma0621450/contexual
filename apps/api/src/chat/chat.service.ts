import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AiProvider, MessageRole } from '@contexual/database';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { ProvidersService } from '../providers/providers.service';
import {
  ChatCompletionMessage,
  OpenAiClient,
} from './openai.client';
import { estimateCostCents } from './pricing';

const DEFAULT_MODEL = 'gpt-4o-mini';
const TITLE_MAX_LENGTH = 60;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providersService: ProvidersService,
    private readonly openAiClient: OpenAiClient,
    private readonly auditService: AuditService,
  ) {}

  async listConversations(organizationId: string, userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { organizationId, userId, isArchived: false },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        model: true,
        provider: true,
        updatedAt: true,
      },
    });

    return conversations;
  }

  async getConversation(
    organizationId: string,
    userId: string,
    conversationId: string,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, role: true, content: true, createdAt: true },
        },
      },
    });

    if (
      !conversation ||
      conversation.organizationId !== organizationId ||
      conversation.userId !== userId
    ) {
      throw new NotFoundException('Conversation not found');
    }

    return {
      id: conversation.id,
      title: conversation.title,
      model: conversation.model,
      provider: conversation.provider,
      messages: conversation.messages,
    };
  }

  async archiveConversation(
    organizationId: string,
    userId: string,
    conversationId: string,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { organizationId: true, userId: true },
    });

    if (
      !conversation ||
      conversation.organizationId !== organizationId ||
      conversation.userId !== userId
    ) {
      throw new NotFoundException('Conversation not found');
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { isArchived: true },
    });

    return { ok: true };
  }

  async sendMessage(
    organizationId: string,
    userId: string,
    input: { conversationId?: string; content: string; model?: string },
  ) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: {
        id: true,
        suspended: true,
        spendLimitCents: true,
        spendUsedCents: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    if (membership.suspended) {
      throw new ForbiddenException(
        'Your access has been suspended by an administrator',
      );
    }

    if (
      membership.spendLimitCents !== null &&
      membership.spendLimitCents > 0 &&
      membership.spendUsedCents >= membership.spendLimitCents
    ) {
      throw new ForbiddenException(
        'You have reached your spending limit. Contact an administrator.',
      );
    }

    const providerKey =
      await this.providersService.getDecryptedKey(organizationId);

    if (!providerKey) {
      throw new BadRequestException(
        'No AI provider is connected. Ask an admin to connect one.',
      );
    }

    if (providerKey.provider !== AiProvider.OPENAI) {
      throw new BadRequestException(
        'Only OpenAI is supported for chat at the moment.',
      );
    }

    const model =
      input.model ?? providerKey.defaultModel ?? DEFAULT_MODEL;

    const conversation = await this.resolveConversation(
      organizationId,
      userId,
      input.conversationId,
      input.content,
      providerKey.provider,
      model,
    );

    const history = await this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });

    const promptMessages: ChatCompletionMessage[] = [
      ...history.map((message) => ({
        role: this.toOpenAiRole(message.role),
        content: message.content,
      })),
      { role: 'user' as const, content: input.content },
    ];

    const completion = await this.openAiClient.createChatCompletion(
      providerKey.apiKey,
      model,
      promptMessages,
    );

    const costCents = estimateCostCents(
      model,
      completion.promptTokens,
      completion.completionTokens,
    );

    const assistantMessage = await this.prisma.$transaction(async (tx) => {
      await tx.message.create({
        data: {
          conversationId: conversation.id,
          role: MessageRole.USER,
          content: input.content,
        },
      });

      const assistant = await tx.message.create({
        data: {
          conversationId: conversation.id,
          role: MessageRole.ASSISTANT,
          content: completion.content,
          promptTokens: completion.promptTokens,
          completionTokens: completion.completionTokens,
        },
        select: { id: true, role: true, content: true, createdAt: true },
      });

      await tx.usageLog.create({
        data: {
          organizationId,
          userId,
          conversationId: conversation.id,
          provider: providerKey.provider,
          model,
          promptTokens: completion.promptTokens,
          completionTokens: completion.completionTokens,
          estimatedCostCents: costCents,
        },
      });

      await tx.membership.update({
        where: { id: membership.id },
        data: { spendUsedCents: { increment: costCents } },
      });

      await tx.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });

      return assistant;
    });

    return {
      conversationId: conversation.id,
      title: conversation.title,
      message: assistantMessage,
      usage: {
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
        estimatedCostCents: costCents,
        model,
      },
    };
  }

  private async resolveConversation(
    organizationId: string,
    userId: string,
    conversationId: string | undefined,
    firstMessage: string,
    provider: AiProvider,
    model: string,
  ) {
    if (conversationId) {
      const existing = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          id: true,
          title: true,
          organizationId: true,
          userId: true,
          isArchived: true,
        },
      });

      if (
        !existing ||
        existing.organizationId !== organizationId ||
        existing.userId !== userId ||
        existing.isArchived
      ) {
        throw new NotFoundException('Conversation not found');
      }

      return existing;
    }

    const created = await this.prisma.conversation.create({
      data: {
        organizationId,
        userId,
        title: this.buildTitle(firstMessage),
        provider,
        model,
      },
      select: { id: true, title: true },
    });

    await this.auditService.record({
      organizationId,
      actorId: userId,
      action: 'conversation.created',
      details: { conversationId: created.id, model },
    });

    return created;
  }

  private buildTitle(message: string): string {
    const trimmed = message.trim().replace(/\s+/g, ' ');

    if (trimmed.length <= TITLE_MAX_LENGTH) {
      return trimmed || 'New Conversation';
    }

    return `${trimmed.slice(0, TITLE_MAX_LENGTH)}...`;
  }

  private toOpenAiRole(role: MessageRole): ChatCompletionMessage['role'] {
    switch (role) {
      case MessageRole.ASSISTANT:
        return 'assistant';
      case MessageRole.SYSTEM:
        return 'system';
      default:
        return 'user';
    }
  }
}
