import { redirect } from 'next/navigation';
import { getAuditLogs, getCurrentUser } from '@/lib/api/server';
import {
  getSafeAuditDetails,
  humanizeAuditAction,
} from '@/lib/audit-format';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const ACTION_LABELS: Record<string, string> = {
  'provider.connected': 'Connected AI provider',
  'provider.disconnected': 'Disconnected AI provider',
  'invite.created': 'Created invite',
  'invite.revoked': 'Revoked invite',
  'member.role_changed': 'Changed member role',
  'member.removed': 'Removed member',
  'member.suspended': 'Suspended member',
  'member.reinstated': 'Reinstated member',
  'member.spend_limit_set': 'Updated spend limit',
  'member.token_limit_set': 'Updated token limit',
  'organization.usage_limits_set': 'Updated organization limits',
  'plan.changed': 'Changed plan',
  'billing.subscription_synced': 'Subscription updated',
  'billing.subscription_canceled': 'Subscription canceled',
  'conversation.created': 'Started conversation',
  'memory.created': 'Created memory',
  'memory.updated': 'Updated memory',
  'memory.deleted': 'Deleted memory',
};

export default async function AuditPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (!user.emailVerifiedAt) {
    redirect('/verify-email');
  }

  if (!user.activeOrganizationId || user.memberships.length === 0) {
    redirect('/onboarding');
  }

  if (user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const logs = await getAuditLogs();

  return (
    <div className="mx-auto w-full max-w-[1070px] px-4 pt-8 pb-10 sm:px-6">
      <div>
        <h1 className="text-[30px] leading-9 font-semibold tracking-[-0.6px] text-white">
          Audit Logs
        </h1>
        <p className="mt-1 text-sm text-[#a1a1aa]">
          Recent sensitive actions in your organization.
        </p>
      </div>

      <section className="mt-8 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
        {logs.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-[#8b8b93]">
            No activity recorded yet.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-white/10 md:hidden">
              {logs.map((log) => {
                const details = getSafeAuditDetails(log.details);
                return (
                  <li key={log.id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-white">
                        {ACTION_LABELS[log.action] ??
                          humanizeAuditAction(log.action)}
                      </p>
                      <time
                        dateTime={log.createdAt}
                        className="shrink-0 text-xs text-[#a1a1aa]"
                      >
                        {formatAuditTime(log.createdAt)}
                      </time>
                    </div>
                    <p className="mt-1 text-sm text-white">
                      {log.actorName ?? 'System'}
                    </p>
                    {log.actorEmail ? (
                      <p className="text-xs text-[#8b8b93]">{log.actorEmail}</p>
                    ) : null}
                    <AuditDetails details={details} />
                  </li>
                );
              })}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-[#8b8b93]">Action</TableHead>
                    <TableHead className="text-[#8b8b93]">Member</TableHead>
                    <TableHead className="text-right text-[#8b8b93]">
                      When
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const details = getSafeAuditDetails(log.details);
                    return (
                      <TableRow key={log.id} className="border-white/10">
                        <TableCell className="whitespace-normal">
                          <p className="font-medium text-white">
                            {ACTION_LABELS[log.action] ??
                              humanizeAuditAction(log.action)}
                          </p>
                          <AuditDetails details={details} />
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <p className="text-white">
                            {log.actorName ?? 'System'}
                          </p>
                          {log.actorEmail ? (
                            <p className="text-xs text-[#8b8b93]">
                              {log.actorEmail}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right whitespace-normal">
                          <time
                            dateTime={log.createdAt}
                            className="text-xs text-[#a1a1aa]"
                          >
                            {formatAuditTime(log.createdAt)}
                          </time>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function formatAuditTime(createdAt: string) {
  return new Date(createdAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function AuditDetails({ details }: { details: [string, string][] }) {
  if (!details.length) return null;
  return (
    <details className="mt-2 text-xs">
      <summary className="w-fit cursor-pointer rounded text-[#8b8b93] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
        View details
      </summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-black/25 p-3">
        {details.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-[#8b8b93]">{label}</dt>
            <dd className="break-all text-white">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
