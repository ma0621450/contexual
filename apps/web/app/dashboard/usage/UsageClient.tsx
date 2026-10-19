'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TriangleAlertIcon } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import type {
  BillingStatus,
  MyUsageSummary,
  TeamOverview,
  UsageSummary,
} from '@/lib/api/server';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type UsageClientProps = {
  isAdmin: boolean;
  myUsage: MyUsageSummary | null;
  usage: UsageSummary | null;
  overview: TeamOverview | null;
  billing: BillingStatus | null;
  currentUserId: string;
  billingNotice: string | null;
};

const PLANS = ['FREE', 'STARTER', 'PRO', 'BUSINESS'] as const;
const PAID_PLANS = ['STARTER', 'PRO', 'BUSINESS'] as const;
const PLAN_LABEL: Record<(typeof PLANS)[number], string> = {
  FREE: 'Free',
  STARTER: 'Starter',
  PRO: 'Pro',
  BUSINESS: 'Business',
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function UsageClient({
  isAdmin,
  myUsage,
  usage,
  overview,
  billing,
  currentUserId,
  billingNotice,
}: UsageClientProps) {
  const router = useRouter();
  const [plan, setPlan] = useState(overview?.planTier ?? 'FREE');
  const [upgradePlan, setUpgradePlan] =
    useState<(typeof PAID_PLANS)[number]>('STARTER');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(billingNotice ?? '');
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({});
  const [tokenLimitDrafts, setTokenLimitDrafts] = useState<
    Record<string, string>
  >({});
  const [organizationSpendLimit, setOrganizationSpendLimit] = useState(() => {
    const cents = usage?.organizationLimits?.monthlySpendLimitCents ?? 0;
    return cents > 0 ? String(cents / 100) : '';
  });
  const [organizationTokenLimit, setOrganizationTokenLimit] = useState(() => {
    const tokens = usage?.organizationLimits?.monthlyTokenLimit ?? 0;
    return tokens > 0 ? String(tokens) : '';
  });

  const stripeEnabled = billing?.stripeConfigured ?? false;

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

  async function handleCheckout() {
    if (pending) return;
    setError('');
    setNotice('');
    setPending('checkout');
    try {
      const result = await apiFetch<{ url: string }>('/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ planTier: upgradePlan }),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.location.href = result.data.url;
    } catch {
      setError('Unable to start checkout.');
    } finally {
      setPending(null);
    }
  }

  async function handlePortal() {
    if (pending) return;
    setError('');
    setNotice('');
    setPending('portal');
    try {
      const result = await apiFetch<{ url: string }>('/billing/portal', {
        method: 'POST',
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.location.href = result.data.url;
    } catch {
      setError('Unable to open billing portal.');
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

  async function saveTokenLimit(userId: string) {
    if (pending) return;
    const tokenLimit = Number(tokenLimitDrafts[userId]);
    if (!Number.isInteger(tokenLimit) || tokenLimit < 0) {
      setError('Enter a whole token amount (0 = unlimited).');
      return;
    }
    setPending(`token-limit-${userId}`);
    setError('');
    const result = await apiFetch(
      `/organizations/members/${userId}/token-limit`,
      {
        method: 'PATCH',
        body: JSON.stringify({ tokenLimit }),
      },
    );
    if (result.ok) {
      setNotice('Token limit updated.');
      router.refresh();
    } else {
      setError(result.error);
    }
    setPending(null);
  }

  async function saveOrganizationLimits() {
    const spendDollars =
      organizationSpendLimit.trim() === '' ? 0 : Number(organizationSpendLimit);
    const monthlyTokenLimit =
      organizationTokenLimit.trim() === '' ? 0 : Number(organizationTokenLimit);
    if (
      !Number.isFinite(spendDollars) ||
      spendDollars < 0 ||
      !Number.isInteger(monthlyTokenLimit) ||
      monthlyTokenLimit < 0
    ) {
      setError('Enter valid non-negative organization limits.');
      return;
    }
    setPending('organization-limits');
    setError('');
    const result = await apiFetch('/organizations/usage-limits', {
      method: 'PATCH',
      body: JSON.stringify({
        monthlySpendLimitCents: Math.round(spendDollars * 100),
        monthlyTokenLimit,
      }),
    });
    if (result.ok) {
      setNotice('Organization limits updated.');
      router.refresh();
    } else {
      setError(result.error);
    }
    setPending(null);
  }

  const organizationAlerts = [
    {
      label: 'budget',
      used: usage?.organizationLimits?.monthlySpendUsedCents ?? 0,
      limit: usage?.organizationLimits?.monthlySpendLimitCents ?? 0,
    },
    {
      label: 'token cap',
      used: usage?.organizationLimits?.monthlyTokensUsed ?? 0,
      limit: usage?.organizationLimits?.monthlyTokenLimit ?? 0,
    },
  ].filter(({ used, limit }) => limit > 0 && used / limit >= 0.8);

  const tokensUsed = isAdmin
    ? (usage?.organizationLimits?.monthlyTokensUsed ?? 0)
    : (myUsage?.usage.tokensUsed ?? 0);
  const tokenLimit = isAdmin
    ? (usage?.organizationLimits?.monthlyTokenLimit ?? 0)
    : (myUsage?.limits.tokenLimit ?? 0);
  const estimatedCents = isAdmin
    ? (usage?.totals.estimatedCostCents ?? 0)
    : (myUsage?.usage.estimatedCostCents ?? 0);
  const creditsLeft =
    tokenLimit && tokenLimit > 0
      ? Math.max(0, Math.round((1 - tokensUsed / tokenLimit) * 100))
      : null;

  return (
    <div className="mx-auto w-full max-w-[1070px] px-4 pt-8 pb-10 sm:px-6">
      <div>
        <h1 className="text-[30px] leading-9 font-semibold tracking-[-0.6px] text-white">
          {isAdmin ? 'Usage & billing' : 'My usage'}
        </h1>
        <p className="mt-1 text-sm text-[#a1a1aa]">
          {isAdmin
            ? 'Track this month’s AI spend and manage plan and member limits.'
            : 'Track your AI spend and token usage for the current month.'}
        </p>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-4 rounded-lg border border-border bg-accent px-3 py-2 text-sm text-accent-foreground">
          {notice}
        </p>
      ) : null}

      <section className="mt-8">
        <h2 className="text-[18px] font-semibold text-white">
          {isAdmin ? 'Subscription' : 'My usage'}
        </h2>
        <p className="mt-1 text-sm text-[#8b8b93]">
          Current monthly usage and limits. A limit of 0 means unlimited.
        </p>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <span className="inline-flex h-6 items-center rounded-full bg-white/10 px-2.5 text-xs text-white">
              {PLAN_LABEL[overview?.planTier ?? billing?.planTier ?? 'FREE']}
            </span>
            {billing?.subscriptionStatus ? (
              <span className="text-xs text-[#8b8b93]">
                Subscription {billing.subscriptionStatus}
              </span>
            ) : null}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <UsageRing percent={creditsLeft} />
              <div>
                <p className="text-[28px] leading-8 font-semibold tracking-[-0.5px] text-white">
                  {creditsLeft === null ? 'Unlimited' : `${creditsLeft}% credits left`}
                </p>
                <p className="mt-1 text-sm text-[#a1a1aa]">
                  {tokensUsed.toLocaleString()} /{' '}
                  {tokenLimit && tokenLimit > 0
                    ? tokenLimit.toLocaleString()
                    : 'unlimited'}{' '}
                  tokens used
                </p>
              </div>
            </div>
            <p className="text-[32px] leading-none font-semibold text-white">
              {formatCents(estimatedCents)}
            </p>
          </div>
        </div>
      </section>

      {isAdmin ? (
        <>
          {organizationAlerts.map(({ label, used, limit }) => (
            <p
              key={label}
              className="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"
            >
              <TriangleAlertIcon className="size-4 shrink-0" />
              Organization {label} is{' '}
              {used >= limit
                ? 'fully used'
                : `${Math.floor((used / limit) * 100)}% used`}
              .
            </p>
          ))}

          <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-[18px] font-semibold text-white">Plan</h2>
                <p className="mt-1 text-sm text-[#8b8b93]">
                  Current plan: {overview?.planTier ?? 'FREE'} - up to{' '}
                  {overview?.maxMembers ?? 0} members.
                  {stripeEnabled
                    ? ''
                    : ' Plan changes apply immediately.'}
                </p>
              </div>
              {stripeEnabled ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Select
                    value={upgradePlan}
                    onValueChange={(value) =>
                      setUpgradePlan(value as (typeof PAID_PLANS)[number])
                    }
                  >
                    <SelectTrigger className="h-9 w-[140px] border-white/10 bg-[#2a2a2a]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAID_PLANS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {PLAN_LABEL[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleCheckout}
                    disabled={pending === 'checkout'}
                    className="h-9 rounded-lg bg-[#2a2a2a] px-4 text-white hover:bg-[#333333]"
                  >
                    {pending === 'checkout'
                      ? 'Redirecting…'
                      : 'Upgrade via Stripe'}
                  </Button>
                  {billing?.hasBillingAccount ? (
                    <Button
                      variant="outline"
                      onClick={handlePortal}
                      disabled={pending === 'portal'}
                    >
                      {pending === 'portal' ? 'Opening…' : 'Manage billing'}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Select
                      value={plan}
                      onValueChange={(value) => setPlan(value as typeof plan)}
                    >
                      <SelectTrigger className="h-9 w-[140px] border-white/10 bg-[#2a2a2a]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLANS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {PLAN_LABEL[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handlePlanChange}
                      disabled={pending === 'plan'}
                      className="h-9 rounded-lg bg-[#2a2a2a] px-4 text-white hover:bg-[#333333]"
                    >
                      {pending === 'plan' ? 'Updating…' : 'Update Plan'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-[18px] font-semibold text-white">
                  Organization monthly limits
                </h2>
                <p className="mt-1 text-sm text-[#8b8b93]">
                  Set either value to 0 for unlimited. Current usage:{' '}
                  {formatCents(
                    usage?.organizationLimits?.monthlySpendUsedCents ?? 0,
                  )}{' '}
                  and{' '}
                  {(
                    usage?.organizationLimits?.monthlyTokensUsed ?? 0
                  ).toLocaleString()}{' '}
                  tokens.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="org-budget"
                  aria-label="Budget ($)"
                  value={organizationSpendLimit}
                  onChange={(event) =>
                    setOrganizationSpendLimit(event.target.value)
                  }
                  inputMode="decimal"
                  placeholder="Budget"
                  className="h-9 w-28 border-white/10 bg-transparent"
                />
                <Input
                  id="org-tokens"
                  aria-label="Token cap"
                  value={organizationTokenLimit}
                  onChange={(event) =>
                    setOrganizationTokenLimit(event.target.value)
                  }
                  inputMode="numeric"
                  placeholder="Token Cap"
                  className="h-9 w-32 border-white/10 bg-transparent"
                />
                <Button
                  onClick={saveOrganizationLimits}
                  disabled={pending === 'organization-limits'}
                  className="h-9 rounded-lg bg-[#2a2a2a] px-4 text-white hover:bg-[#333333]"
                >
                  Save Limits
                </Button>
              </div>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="mb-3 text-[18px] font-semibold text-white">
              Members
            </h2>
            <div className="overflow-x-auto rounded-xl bg-white/[0.04]">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-[#8b8b93]">Member</TableHead>
                    <TableHead className="text-[#8b8b93]">Usage</TableHead>
                    <TableHead className="text-[#8b8b93]">Spend cap ($)</TableHead>
                    <TableHead className="text-[#8b8b93]">Token Cap</TableHead>
                    <TableHead className="text-[#8b8b93]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(usage?.members ?? []).map((member) => (
                    <TableRow key={member.userId} className="border-white/10">
                      <TableCell>
                        <div className="font-medium text-white">{member.name}</div>
                        <div className="text-xs text-[#8b8b93]">
                          {member.email}
                        </div>
                      </TableCell>
                      <TableCell className="text-white">
                        {formatCents(member.spendUsedCents)}
                        <div className="text-xs text-[#8b8b93]">
                          {member.tokensUsed.toLocaleString()} tokens
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Input
                            className="h-8 w-20 border-white/10 bg-transparent"
                            inputMode="decimal"
                            placeholder={(
                              (member.spendLimitCents ?? 0) / 100
                            ).toFixed(2)}
                            value={limitDrafts[member.userId] ?? ''}
                            onChange={(event) =>
                              setLimitDrafts((prev) => ({
                                ...prev,
                                [member.userId]: event.target.value,
                              }))
                            }
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => saveLimit(member.userId)}
                            disabled={pending === `limit-${member.userId}`}
                          >
                            Save
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Input
                            className="h-8 w-24 border-white/10 bg-transparent"
                            inputMode="numeric"
                            placeholder={String(member.tokenLimit ?? 0)}
                            value={tokenLimitDrafts[member.userId] ?? ''}
                            onChange={(event) =>
                              setTokenLimitDrafts((prev) => ({
                                ...prev,
                                [member.userId]: event.target.value,
                              }))
                            }
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => saveTokenLimit(member.userId)}
                            disabled={
                              pending === `token-limit-${member.userId}`
                            }
                          >
                            Save
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        {member.suspended ? (
                          <Badge variant="destructive" className="mr-2">
                            Suspended
                          </Badge>
                        ) : null}
                        {member.userId === currentUserId ? (
                          <Badge
                            variant="outline"
                            className="border-white/10 bg-[#2c2c2c] text-white"
                          >
                            You
                          </Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              toggleSuspend(member.userId, member.suspended)
                            }
                            className={cn(
                              member.suspended
                                ? 'text-primary'
                                : 'text-destructive',
                            )}
                            disabled={pending === `suspend-${member.userId}`}
                          >
                            {member.suspended ? 'Reinstate' : 'Suspend'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function UsageRing({ percent }: { percent: number | null }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const shown = percent === null ? 100 : Math.max(0, Math.min(100, percent));
  const offset = circumference - (shown / 100) * circumference;

  return (
    <svg width="68" height="68" viewBox="0 0 68 68" aria-hidden="true">
      <circle
        cx="34"
        cy="34"
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="5"
      />
      <circle
        cx="34"
        cy="34"
        r={radius}
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 34 34)"
      />
    </svg>
  );
}
