import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@contexual/ui';
import { ArrowLeftIcon } from 'lucide-react';
import { PlatformApiError, getOrganization } from '@/lib/api/server';
import {
  formatBytes,
  formatCents,
  formatDate,
  formatDateTime,
  formatNumber,
} from '@/lib/format';
import { ImpersonateDialog } from './ImpersonateDialog';

export const metadata: Metadata = { title: 'Organization' };

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-4">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-lg font-semibold">{value}</span>
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let organization;
  try {
    organization = await getOrganization(id);
  } catch (error) {
    if (error instanceof PlatformApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const fileJobEntries = Object.entries(organization.fileJobs).filter(
    ([, count]) => count > 0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/organizations"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          All organizations
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {organization.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {organization.slug} · created{' '}
              {formatDate(organization.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{organization.planTier}</Badge>
            {organization.subscriptionStatus ? (
              <Badge variant="secondary">
                {organization.subscriptionStatus}
              </Badge>
            ) : null}
            {organization.members.length > 0 ? (
              <ImpersonateDialog
                organizationId={organization.id}
                members={organization.members.map((member) => ({
                  userId: member.userId,
                  name: member.name,
                  email: member.email,
                }))}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Members"
          value={`${organization.counts.members} / ${organization.limits.maxMembers}`}
        />
        <Stat
          label="Tokens this period"
          value={formatNumber(organization.usage.monthlyTokensUsed)}
          hint={`limit ${formatNumber(organization.limits.maxMonthlyTokens)}`}
        />
        <Stat
          label="Storage"
          value={formatBytes(organization.counts.storageBytesUsed)}
          hint={`${formatNumber(organization.counts.files)} files of ${formatBytes(organization.limits.maxStorageBytes)}`}
        />
        <Stat
          label="Spend this period"
          value={formatCents(organization.usage.monthlySpendUsedCents)}
          hint={
            organization.usage.monthlySpendLimitCents
              ? `limit ${formatCents(organization.usage.monthlySpendLimitCents)}`
              : 'no limit set'
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="pr-6">Tokens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organization.members.map((member) => (
                  <TableRow key={member.membershipId}>
                    <TableCell className="pl-6">
                      <div className="flex flex-col">
                        <span className="font-medium">{member.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {member.email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={
                            member.role === 'ADMIN' ? 'default' : 'outline'
                          }
                        >
                          {member.role}
                        </Badge>
                        {member.suspended ? (
                          <Badge variant="destructive">Suspended</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="pr-6 text-sm">
                      {formatNumber(member.tokensUsed)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI providers</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {organization.providers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No providers connected.
              </p>
            ) : (
              organization.providers.map((provider) => (
                <div
                  key={provider.provider}
                  className="flex flex-col gap-1 rounded-lg border border-border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {provider.provider}
                    </span>
                    <Badge variant="success">Connected</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Default {provider.defaultModel} ·{' '}
                    {provider.enabledModels.length} model
                    {provider.enabledModels.length === 1 ? '' : 's'} enabled
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Connected {formatDate(provider.connectedAt)}
                    {provider.connectedByName
                      ? ` by ${provider.connectedByName}`
                      : ''}
                  </span>
                </div>
              ))
            )}
            <p className="text-xs text-muted-foreground">
              API keys are never decrypted for platform staff.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage by model</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {organization.usageByModel.length === 0 ? (
              <p className="px-6 text-sm text-muted-foreground">
                No recorded usage yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Model</TableHead>
                    <TableHead>Requests</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead className="pr-6">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {organization.usageByModel.map((entry) => (
                    <TableRow key={`${entry.provider}-${entry.model}`}>
                      <TableCell className="pl-6">
                        <div className="flex flex-col">
                          <span className="font-medium">{entry.model}</span>
                          <span className="text-xs text-muted-foreground">
                            {entry.provider}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatNumber(entry.requests)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatNumber(
                          entry.promptTokens + entry.completionTokens,
                        )}
                      </TableCell>
                      <TableCell className="pr-6 text-sm">
                        {formatCents(entry.estimatedCostCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Files &amp; activity</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {fileJobEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No files uploaded.
                </p>
              ) : (
                fileJobEntries.map(([status, count]) => (
                  <Badge
                    key={status}
                    variant={
                      status === 'READY'
                        ? 'success'
                        : status === 'QUARANTINED' || status === 'FAILED'
                          ? 'destructive'
                          : 'secondary'
                    }
                  >
                    {status.replace('_', ' ').toLowerCase()}: {count}
                  </Badge>
                ))
              )}
            </div>

            <div className="flex flex-col gap-2">
              {organization.recentAudit.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No recent activity.
                </p>
              ) : (
                organization.recentAudit.slice(0, 8).map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm">{entry.action}</span>
                      <span className="text-xs text-muted-foreground">
                        {entry.actor?.email ?? 'system'}
                      </span>
                    </div>
                    <span className="text-xs whitespace-nowrap text-muted-foreground">
                      {formatDateTime(entry.createdAt)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
