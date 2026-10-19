export type SetupStep = {
  id: string;
  label: string;
  href: string;
  done: boolean;
};

export function setupSteps(input: {
  providerConnected: boolean | null;
  hasConversation: boolean;
  hasContext: boolean;
}): SetupStep[] {
  return [
    {
      id: 'provider',
      label: 'Connect an AI provider',
      href: '/dashboard/providers',
      done: input.providerConnected === true,
    },
    {
      id: 'chat',
      label: 'Start a chat',
      href: '/dashboard/chat',
      done: input.hasConversation,
    },
    {
      id: 'context',
      label: 'Add a file or memory',
      href: '/dashboard/files',
      done: input.hasContext,
    },
  ];
}

export function setupProgress(steps: SetupStep[]) {
  if (steps.length === 0) return 0;
  return steps.filter((step) => step.done).length / steps.length;
}

/** Accepts a raw invite token or an onboarding URL that carries one. */
export function parseInviteToken(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const token = url.searchParams.get('invite')?.trim();
    return token || null;
  } catch {
    return trimmed;
  }
}

export function previewLines(titles: string[], empty: string) {
  const visible = titles.map((title) => title.trim()).filter(Boolean).slice(0, 3);
  return visible.length > 0 ? visible : [empty];
}
