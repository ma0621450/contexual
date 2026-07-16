import { cookies } from 'next/headers';

const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL ?? 'http://localhost:3001';

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

export type ProviderStatus = {
  connected: boolean;
  provider: AiProviderId | null;
  defaultModel: string | null;
  connectedAt: string | null;
  connectedByName: string | null;
};

export type ConversationSummary = {
  id: string;
  title: string;
  model: string;
  provider: AiProviderId;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  createdAt: string;
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

export type AuditLogEntry = {
  id: string;
  action: string;
  details: unknown;
  actorName: string | null;
  actorEmail: string | null;
  createdAt: string;
};

export type BillingStatus = {
  stripeConfigured: boolean;
  planTier: 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';
  subscriptionStatus: string | null;
  hasBillingAccount: boolean;
  hasActiveSubscription: boolean;
};

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

  try {
    const response = await fetch(`${INTERNAL_API_URL}/api${path}`, {
      headers: { Cookie: cookieHeader },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
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
    (await serverFetch<OrganizationMembership[]>('/onboarding/organizations')) ??
    []
  );
}

export async function getProviderStatus(): Promise<ProviderStatus | null> {
  return serverFetch<ProviderStatus>('/organizations/providers');
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

export async function getMemories(): Promise<MemoryItem[]> {
  return (await serverFetch<MemoryItem[]>('/memories')) ?? [];
}

export async function getUsage(): Promise<UsageSummary | null> {
  return serverFetch<UsageSummary>('/organizations/usage');
}

export async function getBillingStatus(): Promise<BillingStatus | null> {
  return serverFetch<BillingStatus>('/billing/status');
}

export async function getAuditLogs(): Promise<AuditLogEntry[]> {
  return (await serverFetch<AuditLogEntry[]>('/organizations/audit-logs')) ?? [];
}
