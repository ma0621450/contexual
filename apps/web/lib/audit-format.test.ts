import { describe, expect, it } from 'vitest';
import {
  formatAuditDetailValue,
  getSafeAuditDetails,
  humanizeAuditAction,
} from './audit-format';

describe('audit detail formatting', () => {
  it('formats allowed details and drops secrets and nested values', () => {
    const details = getSafeAuditDetails({
      monthlySpendLimitCents: 1250,
      tokenLimit: null,
      provider: 'OPENAI',
      apiKey: 'must-not-render',
      metadata: { secret: true },
    });

    expect(details).toEqual([
      ['Organization spend limit', '$12.50'],
      ['Token limit', 'No limit'],
      ['Provider', 'OPENAI'],
    ]);
  });

  it('bounds displayed strings and safely humanizes unknown actions', () => {
    expect(formatAuditDetailValue('status', 'x'.repeat(250))).toHaveLength(200);
    expect(humanizeAuditAction('custom.action<script>')).toBe(
      'Custom Actionscript',
    );
  });
});
