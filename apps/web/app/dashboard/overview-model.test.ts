import { describe, expect, it } from 'vitest';
import {
  parseInviteToken,
  previewLines,
  setupProgress,
  setupSteps,
} from './overview-model';

describe('setup steps', () => {
  it('keeps every step incomplete until the workspace has that data', () => {
    const steps = setupSteps({
      providerConnected: false,
      hasConversation: false,
      hasContext: false,
    });

    expect(steps.map((step) => step.done)).toEqual([false, false, false]);
    expect(setupProgress(steps)).toBe(0);
    expect(steps.map((step) => step.href)).toEqual([
      '/dashboard/providers',
      '/dashboard/chat',
      '/dashboard/files',
    ]);
  });

  it('counts only confirmed completions and treats a missing provider status as incomplete', () => {
    const steps = setupSteps({
      providerConnected: null,
      hasConversation: true,
      hasContext: true,
    });

    expect(steps[0]?.done).toBe(false);
    expect(setupProgress(steps)).toBeCloseTo(2 / 3);
  });
});

describe('invite token', () => {
  it('reads the invite query from a pasted onboarding link', () => {
    expect(
      parseInviteToken('https://promplex.app/onboarding?invite=abc123&x=1'),
    ).toBe('abc123');
  });

  it('accepts a raw token and rejects an empty value', () => {
    expect(parseInviteToken('  token-value  ')).toBe('token-value');
    expect(parseInviteToken('   ')).toBeNull();
    expect(parseInviteToken('https://promplex.app/onboarding')).toBeNull();
  });
});

describe('preview lines', () => {
  it('shows the empty copy when there is nothing to list', () => {
    expect(previewLines(['  ', ''], 'No files yet')).toEqual(['No files yet']);
  });

  it('keeps at most three real titles', () => {
    expect(previewLines(['A', 'B', 'C', 'D'], 'empty')).toEqual(['A', 'B', 'C']);
  });
});
