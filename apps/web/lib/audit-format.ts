const DETAIL_LABELS: Record<string, string> = {
  provider: 'Provider',
  defaultModel: 'Default model',
  email: 'Email',
  role: 'Role',
  targetUserId: 'Member ID',
  planTier: 'Plan',
  maxMembers: 'Member limit',
  limitCents: 'Spend limit',
  tokenLimit: 'Token limit',
  monthlySpendLimitCents: 'Organization spend limit',
  monthlyTokenLimit: 'Organization token limit',
  status: 'Status',
  scope: 'Scope',
  model: 'Model',
  conversationId: 'Conversation ID',
  memoryId: 'Memory ID',
};

export function getSafeAuditDetails(details: unknown): [string, string][] {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return [];
  }

  return Object.entries(details)
    .filter(([key]) => key in DETAIL_LABELS)
    .flatMap(([key, value]) => {
      const formatted = formatAuditDetailValue(key, value);
      return formatted === null ? [] : [[DETAIL_LABELS[key], formatted]];
    });
}

export function formatAuditDetailValue(
  key: string,
  value: unknown,
): string | null {
  if (value === null) return 'No limit';
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (key.toLowerCase().includes('cents') && typeof value === 'number') {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
    }).format(value / 100);
  }
  return String(value).slice(0, 200);
}

export function humanizeAuditAction(action: string): string {
  return action
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
