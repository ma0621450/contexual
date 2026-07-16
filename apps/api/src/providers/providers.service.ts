import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiProvider } from '@contexual/database';
import { AuditService } from '../audit/audit.service';
import {
  getDefaultModel,
  getModelsForProvider,
  isModelForProvider,
} from '../chat/model-catalog';
import { EncryptionService } from '../common/crypto/encryption.service';
import { PrismaService } from '../database/prisma.service';

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
    await this.validateProviderKey(provider, apiKey);

    const model =
      defaultModel && defaultModel.length > 0
        ? defaultModel
        : getDefaultModel(provider);
    if (!isModelForProvider(model, provider)) {
      throw new BadRequestException(
        'The default model does not belong to the selected provider.',
      );
    }

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

  getAvailableModels(provider: AiProvider) {
    return getModelsForProvider(provider).map(({ id, label }) => ({
      id,
      label,
    }));
  }

  private async validateProviderKey(
    provider: AiProvider,
    apiKey: string,
  ): Promise<void> {
    let response: Response;

    try {
      response = await fetch(this.validationUrl(provider, apiKey), {
        headers: this.validationHeaders(provider, apiKey),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Could not reach the provider to validate the API key. Try again shortly.',
      );
    }

    if (response.status === 401) {
      throw new BadRequestException(
        'The provider API key was rejected. Please check the key and try again.',
      );
    }

    if (!response.ok) {
      throw new BadRequestException(
        `The provider rejected key validation (status ${response.status}).`,
      );
    }
  }

  private validationUrl(provider: AiProvider, apiKey: string): string {
    switch (provider) {
      case AiProvider.ANTHROPIC:
        return 'https://api.anthropic.com/v1/models';
      case AiProvider.GOOGLE:
        return `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
      case AiProvider.XAI:
        return 'https://api.x.ai/v1/models';
      default:
        return 'https://api.openai.com/v1/models';
    }
  }

  private validationHeaders(
    provider: AiProvider,
    apiKey: string,
  ): Record<string, string> {
    if (provider === AiProvider.ANTHROPIC) {
      return {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      };
    }
    if (provider === AiProvider.GOOGLE) {
      return {};
    }
    return { Authorization: `Bearer ${apiKey}` };
  }
}
