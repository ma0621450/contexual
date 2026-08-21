export type PlatformRole = 'SUPPORT' | 'OPERATOR' | 'OWNER';
export type PlanTier = 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';
export type AiProviderId = 'OPENAI' | 'ANTHROPIC' | 'GOOGLE' | 'XAI';

export type PlatformAdmin = {
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
  mustChangePassword: boolean;
};

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
  planTier: PlanTier;
  subscriptionStatus: string | null;
  memberCount: number;
  maxMembers: number;
  monthlyTokensUsed: number;
  maxMonthlyTokens: number;
  monthlySpendUsedCents: number;
  storageBytesUsed: number;
  maxStorageBytes: number;
  storedFileCount: number;
  createdAt: string;
};

export type OrganizationListResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  planTotals: Partial<Record<PlanTier, number>>;
  organizations: OrganizationSummary[];
};

export type FileProcessingStatus =
  | 'PENDING_SCAN'
  | 'SCANNING'
  | 'EXTRACTING'
  | 'READY'
  | 'QUARANTINED'
  | 'FAILED';

export type OrganizationDetail = {
  id: string;
  name: string;
  slug: string;
  planTier: PlanTier;
  subscriptionStatus: string | null;
  hasStripeCustomer: boolean;
  createdAt: string;
  usage: {
    periodStartedAt: string;
    monthlyTokensUsed: number;
    monthlyTokenLimit: number | null;
    monthlySpendUsedCents: number;
    monthlySpendLimitCents: number | null;
  };
  limits: {
    maxMembers: number;
    maxMonthlyTokens: number;
    maxMemories: number;
    maxFileBytes: number;
    maxStoredFiles: number;
    maxStorageBytes: number;
  };
  counts: {
    members: number;
    conversations: number;
    memories: number;
    files: number;
    storageBytesUsed: number;
  };
  members: {
    membershipId: string;
    userId: string;
    name: string;
    email: string;
    role: 'ADMIN' | 'MEMBER';
    suspended: boolean;
    tokensUsed: number;
    spendUsedCents: number;
    joinedAt: string;
  }[];
  providers: {
    provider: AiProviderId;
    defaultModel: string;
    enabledModels: string[];
    connectedAt: string;
    connectedByName: string | null;
  }[];
  usageByModel: {
    provider: AiProviderId;
    model: string;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    estimatedCostCents: number;
  }[];
  fileJobs: Record<FileProcessingStatus, number>;
  recentAudit: {
    id: string;
    action: string;
    details: unknown;
    createdAt: string;
    actor: { name: string; email: string } | null;
  }[];
};

export type ImpersonationStartResponse = {
  grantId: string;
  endsAt: string;
  redirectUrl: string;
  target: {
    userId: string;
    email: string;
    name: string;
    organizationName: string;
  };
};
