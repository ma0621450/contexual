import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Badge,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@contexual/ui';
import { listOrganizations } from '@/lib/api/server';
import type { PlanTier } from '@/lib/api/types';
import {
  formatBytes,
  formatDate,
  formatNumber,
  percentage,
} from '@/lib/format';
import { OrganizationFilters } from './OrganizationFilters';

export const metadata: Metadata = { title: 'Organizations' };

const PLAN_VARIANT: Record<
  PlanTier,
  'secondary' | 'outline' | 'default' | 'success'
> = {
  FREE: 'outline',
  STARTER: 'secondary',
  PRO: 'default',
  BUSINESS: 'success',
};

function UsageCell({ used, limit }: { used: number; limit: number }) {
  const percent = percentage(used, limit);
  const tone =
    percent >= 90
      ? 'bg-destructive'
      : percent >= 70
        ? 'bg-warning'
        : 'bg-primary';

  return (
    <div className="flex min-w-32 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{percent}%</span>
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <span
          className={`block h-full rounded-full ${tone}`}
          style={{ width: `${percent}%` }}
        />
      </span>
    </div>
  );
}

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; planTier?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? '1');
  const data = await listOrganizations({
    search: params.search,
    planTier: params.planTier,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Organizations</h1>
        <p className="text-sm text-muted-foreground">
          {formatNumber(data.total)} total ·{' '}
          {(['FREE', 'STARTER', 'PRO', 'BUSINESS'] as PlanTier[])
            .map((tier) => `${data.planTotals[tier] ?? 0} ${tier.toLowerCase()}`)
            .join(' · ')}
        </p>
      </div>

      <OrganizationFilters
        search={params.search ?? ''}
        planTier={params.planTier ?? ''}
      />

      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Organization</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>Storage</TableHead>
                <TableHead>Files</TableHead>
                <TableHead className="pr-6">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.organizations.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No organizations match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                data.organizations.map((organization) => (
                  <TableRow key={organization.id}>
                    <TableCell className="pl-6">
                      <Link
                        href={`/organizations/${organization.id}`}
                        className="flex flex-col hover:underline"
                      >
                        <span className="font-medium">{organization.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {organization.slug}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={PLAN_VARIANT[organization.planTier]}>
                        {organization.planTier}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {organization.memberCount} / {organization.maxMembers}
                    </TableCell>
                    <TableCell>
                      <UsageCell
                        used={organization.monthlyTokensUsed}
                        limit={organization.maxMonthlyTokens}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">
                          {formatBytes(organization.storageBytesUsed)} /{' '}
                          {formatBytes(organization.maxStorageBytes)}
                        </span>
                        <UsageCell
                          used={organization.storageBytesUsed}
                          limit={organization.maxStorageBytes}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatNumber(organization.storedFileCount)}
                    </TableCell>
                    <TableCell className="pr-6 text-sm text-muted-foreground">
                      {formatDate(organization.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </span>
          <div className="flex gap-2">
            {data.page > 1 ? (
              <Link
                href={{
                  pathname: '/organizations',
                  query: { ...params, page: data.page - 1 },
                }}
                className="rounded-md border border-border px-3 py-1.5 transition-colors hover:bg-accent"
              >
                Previous
              </Link>
            ) : null}
            {data.page < data.totalPages ? (
              <Link
                href={{
                  pathname: '/organizations',
                  query: { ...params, page: data.page + 1 },
                }}
                className="rounded-md border border-border px-3 py-1.5 transition-colors hover:bg-accent"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
