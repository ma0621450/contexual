import { redirect } from 'next/navigation';
import { getAuditLogs, getCurrentUser } from '@/lib/api/server';
import {
  getSafeAuditDetails,
  humanizeAuditAction,
} from '@/lib/audit-format';
import { Card, CardContent } from '@/components/ui/card';

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
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight">Audit log</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent sensitive actions in your organization.
        </p>
      </div>

      {logs.length === 0 ? (
        <Card className="py-0">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No activity recorded yet.
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <ul className="divide-y divide-border">
            {logs.map((log) => {
              const details = getSafeAuditDetails(log.details);
              return (
                <li key={log.id} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {ACTION_LABELS[log.action] ??
                          humanizeAuditAction(log.action)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {log.actorName ?? 'System'}
                        {log.actorEmail ? ` · ${log.actorEmail}` : ''}
                      </p>
                    </div>
                    <time
                      dateTime={log.createdAt}
                      className="shrink-0 text-xs text-muted-foreground"
                    >
                      {new Date(log.createdAt).toLocaleString()}
                    </time>
                  </div>
                  {details.length ? (
                    <details className="mt-2 text-xs">
                      <summary className="w-fit cursor-pointer rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        View details
                      </summary>
                      <dl className="mt-2 grid gap-1 rounded-lg bg-muted/50 p-3 sm:grid-cols-[auto_1fr] sm:gap-x-4">
                        {details.map(([label, value]) => (
                          <div key={label} className="contents">
                            <dt className="font-medium text-muted-foreground">
                              {label}
                            </dt>
                            <dd className="break-all">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
