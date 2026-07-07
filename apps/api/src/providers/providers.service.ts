import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiProvider } from '@contexual/database';
import { AuditService } from '../audit/audit.service';
import { EncryptionService } from '../common/crypto/encryption.service';
import { PrismaService } from '../database/prisma.service';

const DEFAULT_MODELS: Partial<Record<AiProvider, string>> = {
  [AiProvider.OPENAI]: 'gpt-4o-mini',
};

export type DecryptedProviderKey = {
  provider: AiProvider;
  apiKey: string;
  defaultModel: string | null;
};

@Injectable()
export class ProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly auditService: AuditService,
  ) {}

  async getStatus(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        apiKeyProvider: true,
        defaultModel: true,
        apiKeyAddedAt: true,
        apiKeyAddedBy: { select: { name: true } },
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return {
      connected: organization.apiKeyProvider !== null,
      provider: organization.apiKeyProvider,
      defaultModel: organization.defaultModel,
      connectedAt: organization.apiKeyAddedAt,
      connectedByName: organization.apiKeyAddedBy?.name ?? null,
    };
  }

  async connect(
    organizationId: string,
    userId: string,
    provider: AiProvider,
    apiKey: string,
    defaultModel?: string,
  ) {
    if (provider !== AiProvider.OPENAI) {
      throw new BadRequestException(
        'Only OpenAI is supported at the moment. More providers are coming soon.',
      );
    }

    await this.validateOpenAiKey(apiKey);

    const model =
      defaultModel && defaultModel.length > 0
        ? defaultModel
        : (DEFAULT_MODELS[provider] ?? null);

    const encrypted = this.encryption.encrypt(apiKey);

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        apiKeyCiphertext: encrypted.ciphertext,
        apiKeyIv: encrypted.iv,
        apiKeyProvider: provider,
        defaultModel: model,
        apiKeyAddedById: userId,
        apiKeyAddedAt: new Date(),
      },
    });

    await this.auditService.record({
      organizationId,
      actorId: userId,
      action: 'provider.connected',
      details: { provider, defaultModel: model },
    });

    return { connected: true, provider, defaultModel: model };
  }

  async disconnect(organizationId: string, actorId: string) {
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        apiKeyCiphertext: null,
        apiKeyIv: null,
        apiKeyProvider: null,
        defaultModel: null,
        apiKeyAddedById: null,
        apiKeyAddedAt: null,
      },
    });

    await this.auditService.record({
      organizationId,
      actorId,
      action: 'provider.disconnected',
    });

    return { ok: true };
  }

  async getDecryptedKey(
    organizationId: string,
  ): Promise<DecryptedProviderKey | null> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        apiKeyCiphertext: true,
        apiKeyIv: true,
        apiKeyProvider: true,
        defaultModel: true,
      },
    });

    if (
      !organization?.apiKeyCiphertext ||
      !organization.apiKeyIv ||
      !organization.apiKeyProvider
    ) {
      return null;
    }

    const apiKey = this.encryption.decrypt({
      ciphertext: organization.apiKeyCiphertext,
      iv: organization.apiKeyIv,
    });

    return {
      provider: organization.apiKeyProvider,
      apiKey,
      defaultModel: organization.defaultModel,
    };
  }

  private async validateOpenAiKey(apiKey: string): Promise<void> {
    let response: Response;

    try {
      response = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch {
      throw new ServiceUnavailableException(
        'Could not reach OpenAI to validate the API key. Try again shortly.',
      );
    }

    if (response.status === 401) {
      throw new BadRequestException(
        'The OpenAI API key was rejected. Please check the key and try again.',
      );
    }

    if (!response.ok) {
      throw new BadRequestException(
        `OpenAI rejected the key validation request (status ${response.status}).`,
      );
    }
  }
}
