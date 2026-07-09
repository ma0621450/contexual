import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuditLogs, getCurrentUser } from '@/lib/api/server';

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
  'plan.changed': 'Changed plan',
  'billing.subscription_synced': 'Subscription updated',
  'billing.subscription_canceled': 'Subscription canceled',
  'conversation.created': 'Started conversation',
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
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            Audit log
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Recent sensitive actions in your organization.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-text-muted hover:text-text-primary"
        >
          Back to dashboard
        </Link>
      </div>

      {logs.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface-card p-6 text-sm text-text-muted">
          No activity recorded yet.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface-card">
          {logs.map((log) => (
            <li key={log.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {ACTION_LABELS[log.action] ?? log.action}
                </p>
                <p className="text-xs text-text-muted">
                  {log.actorName ?? 'System'}
                  {log.actorEmail ? ` · ${log.actorEmail}` : ''}
                </p>
              </div>
              <time className="text-xs text-text-muted">
                {new Date(log.createdAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
