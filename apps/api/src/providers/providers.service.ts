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
  getModel,
  getModelsForProvider,
  getProviderForModel,
  isModelForProvider,
  MODEL_CATALOG,
} from '../chat/model-catalog';
import { EncryptionService } from '../common/crypto/encryption.service';
import { PrismaService } from '../database/prisma.service';

export type DecryptedProviderKey = {
  provider: AiProvider;
  apiKey: string;
  defaultModel: string;
};

export type ConnectedProviderStatus = {
  provider: AiProvider;
  defaultModel: string;
  enabledModels: string[];
  connectedAt: Date;
  connectedByName: string | null;
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
      select: { id: true },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const providers = await this.prisma.organizationProvider.findMany({
      where: { organizationId },
      orderBy: { connectedAt: 'asc' },
      select: {
        provider: true,
        defaultModel: true,
        enabledModels: true,
        connectedAt: true,
        connectedBy: { select: { name: true } },
      },
    });

    const connectedProviders: ConnectedProviderStatus[] = providers.map(
      (item) => {
        const enabledModels = this.normalizeEnabledModels(
          item.provider,
          item.enabledModels,
          item.defaultModel,
        );
        const configuredDefault = isModelForProvider(
          item.defaultModel,
          item.provider,
        )
          ? item.defaultModel
          : undefined;
        return {
          provider: item.provider,
          defaultModel: this.resolveDefaultModel(
            item.provider,
            configuredDefault,
            enabledModels,
          ),
          enabledModels,
          connectedAt: item.connectedAt,
          connectedByName: item.connectedBy?.name ?? null,
        };
      },
    );

    return {
      connected: connectedProviders.length > 0,
      providers: connectedProviders,
      provider: connectedProviders[0]?.provider ?? null,
      defaultModel: this.resolveOrgDefaultModel(connectedProviders),
      connectedAt: connectedProviders[0]?.connectedAt ?? null,
      connectedByName: connectedProviders[0]?.connectedByName ?? null,
    };
  }

  async connect(
    organizationId: string,
    userId: string,
    provider: AiProvider,
    apiKey: string,
    defaultModel?: string,
    enabledModels?: string[],
  ) {
    await this.validateProviderKey(provider, apiKey);

    const resolvedEnabled = this.resolveEnabledModels(
      provider,
      enabledModels,
      defaultModel,
    );
    const model = this.resolveDefaultModel(
      provider,
      defaultModel,
      resolvedEnabled,
    );

    const encrypted = this.encryption.encrypt(apiKey);
    const now = new Date();

    await this.prisma.organizationProvider.upsert({
      where: {
        organizationId_provider: { organizationId, provider },
      },
      create: {
        organizationId,
        provider,
        apiKeyCiphertext: encrypted.ciphertext,
        apiKeyIv: encrypted.iv,
        defaultModel: model,
        enabledModels: resolvedEnabled,
        connectedById: userId,
        connectedAt: now,
      },
      update: {
        apiKeyCiphertext: encrypted.ciphertext,
        apiKeyIv: encrypted.iv,
        defaultModel: model,
        enabledModels: resolvedEnabled,
        connectedById: userId,
        connectedAt: now,
      },
    });

    await this.auditService.record({
      organizationId,
      actorId: userId,
      action: 'provider.connected',
      details: {
        provider,
        defaultModel: model,
        enabledModels: resolvedEnabled,
      },
    });

    return {
      connected: true,
      provider,
      defaultModel: model,
      enabledModels: resolvedEnabled,
    };
  }

  async updateModels(
    organizationId: string,
    actorId: string,
    provider: AiProvider,
    enabledModels: string[],
    defaultModel: string,
  ) {
    const existing = await this.prisma.organizationProvider.findUnique({
      where: {
        organizationId_provider: { organizationId, provider },
      },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('That provider is not connected');
    }

    const resolvedEnabled = this.resolveEnabledModels(
      provider,
      enabledModels,
      defaultModel,
    );
    const model = this.resolveDefaultModel(
      provider,
      defaultModel,
      resolvedEnabled,
    );

    await this.prisma.organizationProvider.update({
      where: { id: existing.id },
      data: {
        enabledModels: resolvedEnabled,
        defaultModel: model,
      },
    });

    await this.auditService.record({
      organizationId,
      actorId,
      action: 'provider.models_updated',
      details: {
        provider,
        defaultModel: model,
        enabledModels: resolvedEnabled,
      },
    });

    return {
      provider,
      defaultModel: model,
      enabledModels: resolvedEnabled,
    };
  }

  async disconnect(
    organizationId: string,
    actorId: string,
    provider: AiProvider,
  ) {
    const existing = await this.prisma.organizationProvider.findUnique({
      where: {
        organizationId_provider: { organizationId, provider },
      },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('That provider is not connected');
    }

    await this.prisma.organizationProvider.delete({
      where: { id: existing.id },
    });

    await this.auditService.record({
      organizationId,
      actorId,
      action: 'provider.disconnected',
      details: { provider },
    });

    return { ok: true };
  }

  async getDecryptedKey(
    organizationId: string,
    provider: AiProvider,
  ): Promise<DecryptedProviderKey | null> {
    const connection = await this.prisma.organizationProvider.findUnique({
      where: {
        organizationId_provider: { organizationId, provider },
      },
      select: {
        provider: true,
        apiKeyCiphertext: true,
        apiKeyIv: true,
        defaultModel: true,
      },
    });

    if (!connection) return null;

    const apiKey = this.encryption.decrypt({
      ciphertext: connection.apiKeyCiphertext,
      iv: connection.apiKeyIv,
    });

    return {
      provider: connection.provider,
      apiKey,
      defaultModel: connection.defaultModel,
    };
  }

  async resolveChatCredentials(
    organizationId: string,
    requestedModel?: string,
  ): Promise<DecryptedProviderKey & { model: string }> {
    const status = await this.getStatus(organizationId);
    if (!status.connected || status.providers.length === 0) {
      throw new BadRequestException(
        'No AI provider is connected. Ask an admin to connect one.',
      );
    }

    const model = requestedModel?.trim() || status.defaultModel;
    if (!model) {
      throw new BadRequestException(
        'No AI model is available. Ask an admin to connect a provider.',
      );
    }

    const catalogEntry = getModel(model);
    if (!catalogEntry) {
      throw new BadRequestException('The selected model is not supported.');
    }

    const connection = status.providers.find(
      (item) => item.provider === catalogEntry.provider,
    );
    if (!connection) {
      throw new BadRequestException(
        `Connect ${catalogEntry.provider} before using ${catalogEntry.label}.`,
      );
    }
    if (!connection.enabledModels.includes(model)) {
      throw new BadRequestException(
        'That model is not enabled for this organization. Ask an admin to enable it.',
      );
    }

    const providerKey = await this.getDecryptedKey(
      organizationId,
      catalogEntry.provider,
    );
    if (!providerKey) {
      throw new BadRequestException(
        `Connect ${catalogEntry.provider} before using ${catalogEntry.label}.`,
      );
    }

    return { ...providerKey, model };
  }

  getAvailableModels() {
    return MODEL_CATALOG.map(
      ({ id, provider, label, contextWindow, recommended }) => ({
        id,
        provider,
        label,
        contextWindow,
        isDefault: recommended === true || id === getDefaultModel(provider),
      }),
    );
  }

  private resolveEnabledModels(
    provider: AiProvider,
    enabledModels: string[] | undefined,
    defaultModel?: string,
  ): string[] {
    const catalogIds = getModelsForProvider(provider).map((model) => model.id);
    const requested =
      enabledModels && enabledModels.length > 0
        ? [...new Set(enabledModels)]
        : catalogIds;

    const invalid = requested.filter((modelId) => !catalogIds.includes(modelId));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `These models are not available for ${provider}: ${invalid.join(', ')}`,
      );
    }

    const withDefault =
      defaultModel && catalogIds.includes(defaultModel)
        ? [...new Set([...requested, defaultModel])]
        : requested;

    if (withDefault.length === 0) {
      throw new BadRequestException('Enable at least one model');
    }

    return withDefault;
  }

  private resolveDefaultModel(
    provider: AiProvider,
    defaultModel: string | undefined,
    enabledModels: string[],
  ): string {
    if (defaultModel && defaultModel.length > 0) {
      if (!isModelForProvider(defaultModel, provider)) {
        throw new BadRequestException(
          'The default model does not belong to the selected provider.',
        );
      }
      if (!enabledModels.includes(defaultModel)) {
        throw new BadRequestException(
          'The default model must be one of the enabled models.',
        );
      }
      return defaultModel;
    }

    const recommended = getDefaultModel(provider);
    if (enabledModels.includes(recommended)) return recommended;
    return enabledModels[0]!;
  }

  private normalizeEnabledModels(
    provider: AiProvider,
    enabledModels: string[],
    defaultModel: string,
  ): string[] {
    const catalogIds = new Set(
      getModelsForProvider(provider).map((model) => model.id),
    );
    const filtered = enabledModels.filter((modelId) => catalogIds.has(modelId));
    if (filtered.length === 0) {
      return this.resolveEnabledModels(provider, undefined, defaultModel);
    }
    if (catalogIds.has(defaultModel) && !filtered.includes(defaultModel)) {
      return [...filtered, defaultModel];
    }
    return filtered;
  }

  private resolveOrgDefaultModel(
    providers: ConnectedProviderStatus[],
  ): string | null {
    if (providers.length === 0) return null;

    for (const connection of providers) {
      if (
        connection.enabledModels.includes(connection.defaultModel) &&
        getProviderForModel(connection.defaultModel) === connection.provider
      ) {
        return connection.defaultModel;
      }
    }

    return providers[0]?.enabledModels[0] ?? null;
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
