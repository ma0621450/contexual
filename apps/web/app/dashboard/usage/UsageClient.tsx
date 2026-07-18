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
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  const [organizationSpendLimit, setOrganizationSpendLimit] = useState(
    String((usage?.organizationLimits?.monthlySpendLimitCents ?? 0) / 100),
  );
  const [organizationTokenLimit, setOrganizationTokenLimit] = useState(
    String(usage?.organizationLimits?.monthlyTokenLimit ?? 0),
  );

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
    const spendDollars = Number(organizationSpendLimit);
    const monthlyTokenLimit = Number(organizationTokenLimit);
    if (
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight">
          {isAdmin ? 'Usage & billing' : 'My usage'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
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

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>My usage</CardTitle>
          <CardDescription>
            Current monthly usage and limits. A limit of 0 means unlimited.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Estimated cost</p>
            <p className="mt-1 text-2xl font-semibold">
              {formatCents(myUsage?.usage.estimatedCostCents ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatCents(myUsage?.usage.spendUsedCents ?? 0)} of{' '}
              {formatCents(myUsage?.limits.spendLimitCents ?? 0)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Tokens used</p>
            <p className="mt-1 text-2xl font-semibold">
              {(myUsage?.usage.tokensUsed ?? 0).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">
              Limit {(myUsage?.limits.tokenLimit ?? 0).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Prompt / completion</p>
            <p className="mt-1 text-2xl font-semibold">
              {(myUsage?.usage.promptTokens ?? 0).toLocaleString()} /{' '}
              {(myUsage?.usage.completionTokens ?? 0).toLocaleString()}
            </p>
          </div>
        </CardContent>
      </Card>

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

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: 'Total estimated cost',
                value: formatCents(usage?.totals.estimatedCostCents ?? 0),
              },
              {
                label: 'Prompt tokens',
                value: (usage?.totals.promptTokens ?? 0).toLocaleString(),
              },
              {
                label: 'Completion tokens',
                value: (usage?.totals.completionTokens ?? 0).toLocaleString(),
              },
            ].map((stat) => (
              <Card key={stat.label} className="gap-2 py-5">
                <CardContent>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">
                    {stat.value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Plan</CardTitle>
              <CardDescription>
                Current plan: {overview?.planTier ?? 'FREE'} · up to{' '}
                {overview?.maxMembers ?? 0} members
                {billing?.subscriptionStatus
                  ? ` · subscription ${billing.subscriptionStatus}`
                  : ''}
                .
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stripeEnabled ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Select
                    value={upgradePlan}
                    onValueChange={(value) =>
                      setUpgradePlan(value as (typeof PAID_PLANS)[number])
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAID_PLANS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleCheckout}
                    disabled={pending === 'checkout'}
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
                  <p className="mb-4 text-xs text-muted-foreground">
                    Stripe is not configured — plan changes apply immediately
                    without payment (dev mode).
                  </p>
                  <div className="flex items-center gap-3">
                    <Select
                      value={plan}
                      onValueChange={(value) => setPlan(value as typeof plan)}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLANS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handlePlanChange}
                      disabled={pending === 'plan'}
                    >
                      {pending === 'plan' ? 'Updating…' : 'Update plan'}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Organization monthly limits</CardTitle>
              <CardDescription>
                Set either value to 0 for unlimited. Current usage:{' '}
                {formatCents(
                  usage?.organizationLimits?.monthlySpendUsedCents ?? 0,
                )}{' '}
                and{' '}
                {(
                  usage?.organizationLimits?.monthlyTokensUsed ?? 0
                ).toLocaleString()}{' '}
                tokens.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="org-budget">Budget ($)</Label>
                  <Input
                    id="org-budget"
                    value={organizationSpendLimit}
                    onChange={(event) =>
                      setOrganizationSpendLimit(event.target.value)
                    }
                    inputMode="decimal"
                    className="w-32"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="org-tokens">Token cap</Label>
                  <Input
                    id="org-tokens"
                    value={organizationTokenLimit}
                    onChange={(event) =>
                      setOrganizationTokenLimit(event.target.value)
                    }
                    inputMode="numeric"
                    className="w-40"
                  />
                </div>
                <Button
                  onClick={saveOrganizationLimits}
                  disabled={pending === 'organization-limits'}
                >
                  Save limits
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Per-member usage</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Spend cap ($)</TableHead>
                    <TableHead>Token cap</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(usage?.members ?? []).map((member) => (
                    <TableRow key={member.userId}>
                      <TableCell>
                        <div className="font-medium">{member.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {member.email} · {member.role}
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatCents(member.spendUsedCents)}
                        <div className="text-xs text-muted-foreground">
                          {member.tokensUsed.toLocaleString()} tokens
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Input
                            className="w-24"
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
                            className="w-28"
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
                          <Badge variant="outline">You</Badge>
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
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
