export function getUtcMonthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function isLimitReached(
  used: number,
  limit: number | null | undefined,
): boolean {
  return typeof limit === 'number' && limit > 0 && used >= limit;
}
