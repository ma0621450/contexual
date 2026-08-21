import { cookies } from 'next/headers';

const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL ?? 'http://localhost:3001';
const API_TIMEOUT_MS = Number(process.env.API_SERVER_TIMEOUT_MS ?? 3000);

export type OrganizationRole = 'ADMIN' | 'MEMBER';

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: string | null;
  activeOrganizationId: string | null;
  role: OrganizationRole | null;
  memberships: {
    id: string;
    organizationId: string;
    role: OrganizationRole;
    suspended: boolean;
  }[];
  isImpersonated?: boolean;
};

export type TeamMember = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: OrganizationRole;
  suspended: boolean;
  joinedAt: string;
};

export type TeamInvite = {
  id: string;
  email: string;
  role: OrganizationRole;
  token: string;
  expiresAt: string;
  createdAt: string;
};

export type TeamOverview = {
  id: string;
  name: string;
  slug: string;
  planTier: 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';
  maxMembers: number;
  memberCount: number;
  pendingInvites: number;
  seatsRemaining: number;
};

export type OrganizationMembership = {
  id: string;
  name: string;
  slug: string;
  planTier: 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';
  role: OrganizationRole;
  suspended: boolean;
};

export type AiProviderId = 'OPENAI' | 'ANTHROPIC' | 'GOOGLE' | 'XAI';

export type ConnectedProvider = {
  provider: AiProviderId;
  defaultModel: string;
  enabledModels: string[];
  connectedAt: string;
  connectedByName: string | null;
};

export type ProviderStatus = {
  connected: boolean;
  providers: ConnectedProvider[];
  provider: AiProviderId | null;
  defaultModel: string | null;
  connectedAt: string | null;
  connectedByName: string | null;
};

export type ProviderModel = {
  id: string;
  provider: AiProviderId;
  label: string;
  contextWindow: number;
  isDefault: boolean;
};

export type ConversationSummary = {
  id: string;
  title: string;
  model: string;
  provider: AiProviderId;
  updatedAt: string;
  pinnedAt?: string | null;
  folderId?: string | null;
  isShared?: boolean;
  isArchived?: boolean;
  snippet?: string;
};

export type ChatFolder = {
  id: string;
  name: string;
  createdAt: string;
  instructions?: string | null;
  defaultModel?: string | null;
  fileIds?: string[];
};

export type ChatMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  createdAt: string;
  parentId?: string | null;
  metadata?: {
    feedback?: 'up' | 'down';
    compareSlot?: number;
    compareWinner?: boolean;
    compareMerged?: boolean;
  };
  attachments?: {
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }[];
};

export type ConversationDetail = {
  id: string;
  title: string;
  model: string;
  provider: AiProviderId;
  folderId?: string | null;
  pinnedAt?: string | null;
  instructions?: string | null;
  shareToken?: string | null;
  isShared?: boolean;
  shareExpiresAt?: string | null;
  activeLeafId?: string | null;
  webSearchEnabled?: boolean;
  isArchived?: boolean;
  messages: ChatMessage[];
};

export type MemoryItem = {
  id: string;
  organizationId: string;
  userId: string | null;
  scope: 'USER' | 'ORGANIZATION';
  title: string;
  content: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UsageMember = {
  userId: string;
  name: string;
  email: string;
  role: OrganizationRole;
  suspended: boolean;
  spendLimitCents: number | null;
  spendUsedCents: number;
  tokenLimit: number | null;
  tokensUsed: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostCents: number;
};

export type UsageSummary = {
  spendPeriodStartedAt: string;
  organizationLimits: {
    monthlySpendLimitCents: number | null;
    monthlySpendUsedCents: number;
    monthlyTokenLimit: number | null;
    monthlyTokensUsed: number;
  } | null;
  totals: {
    promptTokens: number;
    completionTokens: number;
    estimatedCostCents: number;
  };
  members: UsageMember[];
};

export type MyUsageSummary = {
  spendPeriodStartedAt: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    estimatedCostCents: number;
    tokensUsed: number;
    spendUsedCents: number;
  };
  limits: {
    spendLimitCents: number | null;
    tokenLimit: number | null;
  };
  organizationLimits: {
    monthlySpendLimitCents: number | null;
    monthlySpendUsedCents: number;
    monthlyTokenLimit: number | null;
    monthlyTokensUsed: number;
  } | null;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  details: unknown;
  actorName: string | null;
  actorEmail: string | null;
  createdAt: string;
};

export type FileProcessingStatus =
  | 'PENDING_SCAN'
  | 'SCANNING'
  | 'EXTRACTING'
  | 'READY'
  | 'QUARANTINED'
  | 'FAILED';

export type StoredFile = {
  id: string;
  filename: string;
  mimeType: string;
  detectedMimeType: string | null;
  sizeBytes: number;
  processingStatus: FileProcessingStatus;
  scanBypassed: boolean;
  failureCode: string | null;
  failureMessage: string | null;
  uploadedById: string;
  uploadedBy?: {
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type BillingStatus = {
  stripeConfigured: boolean;
  planTier: 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';
  subscriptionStatus: string | null;
  hasBillingAccount: boolean;
  hasActiveSubscription: boolean;
};

export class ApiUnavailableError extends Error {
  constructor(message = 'The API is temporarily unavailable.') {
    super(message);
    this.name = 'ApiUnavailableError';
  }
}

async function getCookieHeader(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');

  return cookieHeader || null;
}

async function serverFetch<T>(path: string): Promise<T | null> {
  const cookieHeader = await getCookieHeader();

  if (!cookieHeader) {
    return null;
  }

  let response: Response;
  try {
    response = await fetch(`${INTERNAL_API_URL}/api${path}`, {
      headers: { Cookie: cookieHeader },
      cache: 'no-store',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch {
    throw new ApiUnavailableError();
  }

  if (response.status >= 500) {
    throw new ApiUnavailableError();
  }
  if (!response.ok) {
    return null;
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiUnavailableError('The API returned an invalid response.');
  }
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  return serverFetch<CurrentUser>('/auth/me');
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  return (await serverFetch<TeamMember[]>('/organizations/members')) ?? [];
}

export async function getTeamInvites(): Promise<TeamInvite[]> {
  return (await serverFetch<TeamInvite[]>('/organizations/invites')) ?? [];
}

export async function getTeamOverview(): Promise<TeamOverview | null> {
  return serverFetch<TeamOverview>('/organizations/overview');
}

export async function getOrganizations(): Promise<OrganizationMembership[]> {
  return (
    (await serverFetch<OrganizationMembership[]>(
      '/onboarding/organizations',
    )) ?? []
  );
}

export async function getProviderStatus(): Promise<ProviderStatus | null> {
  return serverFetch<ProviderStatus>('/organizations/providers');
}

export async function getProviderModels(): Promise<ProviderModel[]> {
  return (
    (await serverFetch<ProviderModel[]>('/organizations/providers/models')) ??
    []
  );
}

export async function getConversations(): Promise<ConversationSummary[]> {
  return (
    (await serverFetch<ConversationSummary[]>('/chat/conversations')) ?? []
  );
}

export async function getConversation(
  id: string,
): Promise<ConversationDetail | null> {
  return serverFetch<ConversationDetail>(`/chat/conversations/${id}`);
}

export async function getSharedConversation(
  token: string,
): Promise<ConversationDetail | null> {
  return serverFetch<ConversationDetail>(`/chat/shared/${token}`);
}

export async function getPublicConversation(
  token: string,
): Promise<ConversationDetail | null> {
  let response: Response;
  try {
    response = await fetch(`${INTERNAL_API_URL}/api/chat/public/${token}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  try {
    return (await response.json()) as ConversationDetail;
  } catch {
    return null;
  }
}

export async function getMemories(): Promise<MemoryItem[]> {
  return (await serverFetch<MemoryItem[]>('/memories')) ?? [];
}

export async function getUsage(): Promise<UsageSummary | null> {
  return serverFetch<UsageSummary>('/organizations/usage');
}

export async function getMyUsage(): Promise<MyUsageSummary | null> {
  return serverFetch<MyUsageSummary>('/organizations/usage/me');
}

export async function getBillingStatus(): Promise<BillingStatus | null> {
  return serverFetch<BillingStatus>('/billing/status');
}

export async function getAuditLogs(): Promise<AuditLogEntry[]> {
  return (
    (await serverFetch<AuditLogEntry[]>('/organizations/audit-logs')) ?? []
  );
}

export async function getFiles(): Promise<StoredFile[]> {
  return (await serverFetch<StoredFile[]>('/files')) ?? [];
}
