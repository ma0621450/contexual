import { redirect } from 'next/navigation';
import { getAuditLogs, getCurrentUser } from '@/lib/api/server';
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
            {logs.map((log) => (
              <li
                key={log.id}
                className="flex items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {ACTION_LABELS[log.action] ?? log.action}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {log.actorName ?? 'System'}
                    {log.actorEmail ? ` · ${log.actorEmail}` : ''}
                  </p>
                </div>
                <time className="shrink-0 text-xs text-muted-foreground">
                  {new Date(log.createdAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
