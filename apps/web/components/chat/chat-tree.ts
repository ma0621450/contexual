export type TreeMessage = {
  id: string;
  parentId?: string | null;
  role?: string;
  createdAt: string | Date;
};

function timestamp(value: string | Date) {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function walkToRoot<T extends TreeMessage>(
  messages: T[],
  leafId: string | null | undefined,
): T[] {
  const byId = new Map(messages.map((message) => [message.id, message]));
  if (!leafId || !byId.has(leafId)) {
    return [...messages].sort(
      (left, right) => timestamp(left.createdAt) - timestamp(right.createdAt),
    );
  }

  const path: T[] = [];
  const seen = new Set<string>();
  let current: T | undefined = byId.get(leafId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path.reverse();
}

export function siblingsOf<T extends TreeMessage>(messages: T[], message: T): T[] {
  return messages
    .filter(
      (item) =>
        (item.parentId ?? null) === (message.parentId ?? null) &&
        (item.role ?? '') === (message.role ?? ''),
    )
    .sort((left, right) => timestamp(left.createdAt) - timestamp(right.createdAt));
}

export function withCompareSiblings<
  T extends TreeMessage & { metadata?: { compareSlot?: number } },
>(messages: T[], path: T[]): T[] {
  const last = path[path.length - 1];
  if (!last || last.role !== 'ASSISTANT') return path;
  const compared = siblingsOf(messages, last).filter(
    (item) =>
      item.role === 'ASSISTANT' && item.metadata?.compareSlot !== undefined,
  );
  if (compared.length < 2) return path;
  const sorted = [...compared].sort(
    (left, right) =>
      (left.metadata?.compareSlot ?? 0) - (right.metadata?.compareSlot ?? 0),
  );
  return [...path.slice(0, -1), ...sorted];
}

export function latestDescendantId<T extends TreeMessage>(
  messages: T[],
  rootId: string,
): string {
  const childrenOf = (id: string) =>
    messages
      .filter((item) => item.parentId === id)
      .sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt));

  let current = rootId;
  for (let depth = 0; depth < messages.length + 1; depth += 1) {
    const next = childrenOf(current)[0];
    if (!next) return current;
    current = next.id;
  }
  return current;
}

export function collectDescendantIds<T extends TreeMessage>(
  messages: T[],
  rootId: string,
): string[] {
  const ids = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const message of messages) {
      if (
        message.parentId &&
        ids.has(message.parentId) &&
        !ids.has(message.id)
      ) {
        ids.add(message.id);
        added = true;
      }
    }
  }
  return [...ids];
}
