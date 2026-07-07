'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import type { TeamOverview, UsageSummary } from '@/lib/api/server';

type UsageClientProps = {
  usage: UsageSummary | null;
  overview: TeamOverview | null;
  currentUserId: string;
};

const PLANS = ['FREE', 'STARTER', 'PRO', 'BUSINESS'] as const;

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function UsageClient({
  usage,
  overview,
  currentUserId,
}: UsageClientProps) {
  const router = useRouter();
  const [plan, setPlan] = useState(overview?.planTier ?? 'FREE');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({});

  async function handlePlanChange() {
    if (pending) return;
    setError('');
    setNotice('');
    setPending('plan');
    try {
      const result = await apiFetch('/organizations/plan', {
        method: 'PATCH',
        body: JSON.stringify({ planTier: plan }),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice('Plan updated.');
      router.refresh();
    } catch {
      setError('Unable to change plan.');
    } finally {
      setPending(null);
    }
  }

  async function toggleSuspend(userId: string, suspended: boolean) {
    if (pending) return;
    setError('');
    setNotice('');
    setPending(`suspend-${userId}`);
    try {
      const result = await apiFetch(
        `/organizations/members/${userId}/suspend`,
        {
          method: 'PATCH',
          body: JSON.stringify({ suspended: !suspended }),
        },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError('Unable to update member.');
    } finally {
      setPending(null);
    }
  }

  async function saveLimit(userId: string) {
    if (pending) return;
    const dollars = Number(limitDrafts[userId]);
    if (Number.isNaN(dollars) || dollars < 0) {
      setError('Enter a valid dollar amount (0 = unlimited).');
      return;
    }
    setError('');
    setNotice('');
    setPending(`limit-${userId}`);
    try {
      const result = await apiFetch(
        `/organizations/members/${userId}/spend-limit`,
        {
          method: 'PATCH',
          body: JSON.stringify({ limitCents: Math.round(dollars * 100) }),
        },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice('Spend limit updated.');
      router.refresh();
    } catch {
      setError('Unable to update spend limit.');
    } finally {
      setPending(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            Usage &amp; Billing
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Track AI spend and manage your plan and per-member limits.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-text-muted hover:text-text-primary"
        >
          Back to dashboard
        </Link>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-semantic-error/20 bg-semantic-error/5 px-3 py-2 text-sm text-semantic-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-4 rounded-lg border border-brand-primary/20 bg-brand-tint px-3 py-2 text-sm text-brand-primary">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-card p-5">
          <p className="text-sm text-text-muted">Total estimated cost</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {formatCents(usage?.totals.estimatedCostCents ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface-card p-5">
          <p className="text-sm text-text-muted">Prompt tokens</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {(usage?.totals.promptTokens ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface-card p-5">
          <p className="text-sm text-text-muted">Completion tokens</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {(usage?.totals.completionTokens ?? 0).toLocaleString()}
          </p>
        </div>
      </div>

      <section className="mt-8 rounded-xl border border-border bg-surface-card p-6">
        <h2 className="text-base font-semibold text-text-primary">Plan</h2>
        <p className="mt-1 text-sm text-text-muted">
          Current plan: {overview?.planTier ?? 'FREE'} · up to{' '}
          {overview?.maxMembers ?? 0} members. Changing the plan updates member
          limits immediately (no payment collected in this version).
        </p>
        <div className="mt-4 flex items-center gap-3">
          <select
            value={plan}
            onChange={(event) =>
              setPlan(event.target.value as typeof plan)
            }
            className="auth-input w-40"
          >
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handlePlanChange}
            className="btn-primary w-auto shrink-0"
            disabled={pending === 'plan'}
          >
            {pending === 'plan' ? 'Updating...' : 'Update plan'}
          </button>
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-border bg-surface-card p-6">
        <h2 className="text-base font-semibold text-text-primary">
          Per-member usage
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-text-muted">
              <tr className="border-b border-border">
                <th className="pb-2 pr-4 font-medium">Member</th>
                <th className="pb-2 pr-4 font-medium">Spend</th>
                <th className="pb-2 pr-4 font-medium">Limit ($, 0=∞)</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(usage?.members ?? []).map((member) => (
                <tr key={member.userId} className="border-b border-border">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-text-primary">
                      {member.name}
                    </div>
                    <div className="text-xs text-text-muted">
                      {member.email} · {member.role}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-text-primary">
                    {formatCents(member.spendUsedCents)}
                    <span className="text-text-muted">
                      {' '}
                      ({member.completionTokens.toLocaleString()} out)
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <input
                        className="auth-input w-24"
                        inputMode="decimal"
                        placeholder={((member.spendLimitCents ?? 0) / 100).toFixed(
                          2,
                        )}
                        value={limitDrafts[member.userId] ?? ''}
                        onChange={(event) =>
                          setLimitDrafts((prev) => ({
                            ...prev,
                            [member.userId]: event.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        onClick={() => saveLimit(member.userId)}
                        className="text-sm font-medium text-brand-primary hover:underline disabled:opacity-60"
                        disabled={pending === `limit-${member.userId}`}
                      >
                        Save
                      </button>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    {member.userId === currentUserId ? (
                      <span className="text-xs text-text-muted">You</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          toggleSuspend(member.userId, member.suspended)
                        }
                        className={`text-sm font-medium hover:underline disabled:opacity-60 ${
                          member.suspended
                            ? 'text-brand-primary'
                            : 'text-semantic-error'
                        }`}
                        disabled={pending === `suspend-${member.userId}`}
                      >
                        {member.suspended ? 'Reinstate' : 'Suspend'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
