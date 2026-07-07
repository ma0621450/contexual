'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import type {
  OrganizationRole,
  TeamInvite,
  TeamMember,
  TeamOverview,
} from '@/lib/api/server';
import { inviteMemberSchema } from '@/lib/validations/team';

type TeamClientProps = {
  currentUserId: string;
  isAdmin: boolean;
  members: TeamMember[];
  invites: TeamInvite[];
  overview: TeamOverview | null;
};

export function TeamClient({
  currentUserId,
  isAdmin,
  members,
  invites,
  overview,
}: TeamClientProps) {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrganizationRole>('MEMBER');
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const seatsFull = overview ? overview.seatsRemaining <= 0 : false;

  function refresh() {
    router.refresh();
  }

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    if (pendingAction) return;

    setFieldError('');
    setFormError('');
    setNotice('');

    const parsed = inviteMemberSchema.safeParse({ email, role });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }

    setPendingAction('invite');
    try {
      const result = await apiFetch<{ token: string }>(
        '/organizations/invites',
        {
          method: 'POST',
          body: JSON.stringify(parsed.data),
        },
      );

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      setEmail('');
      setRole('MEMBER');
      setNotice('Invitation created. Share the invite link below.');
      refresh();
    } catch {
      setFormError('Unable to create invite. Check your connection.');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    if (pendingAction) return;
    setFormError('');
    setNotice('');
    setPendingAction(`revoke-${inviteId}`);
    try {
      const result = await apiFetch(`/organizations/invites/${inviteId}`, {
        method: 'DELETE',
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      refresh();
    } catch {
      setFormError('Unable to revoke invite. Check your connection.');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRoleChange(userId: string, nextRole: OrganizationRole) {
    if (pendingAction) return;
    setFormError('');
    setNotice('');
    setPendingAction(`role-${userId}`);
    try {
      const result = await apiFetch(`/organizations/members/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      refresh();
    } catch {
      setFormError('Unable to update role. Check your connection.');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (pendingAction) return;
    setFormError('');
    setNotice('');
    setPendingAction(`remove-${userId}`);
    try {
      const result = await apiFetch(`/organizations/members/${userId}`, {
        method: 'DELETE',
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      refresh();
    } catch {
      setFormError('Unable to remove member. Check your connection.');
    } finally {
      setPendingAction(null);
    }
  }

  async function copyInviteLink(token: string) {
    const link = `${window.location.origin}/onboarding?invite=${token}`;
    try {
      await navigator.clipboard.writeText(link);
      setNotice('Invite link copied to clipboard.');
    } catch {
      setNotice(link);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">Team</h1>
        <p className="mt-1 text-sm text-text-muted">
          Manage your organization&apos;s members and invitations.
        </p>
      </div>

      {overview ? (
        <div className="mb-6 rounded-xl border border-border bg-surface-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">
                {overview.name}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Plan: {overview.planTier}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-text-primary">
                {overview.memberCount} / {overview.maxMembers} members
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {overview.pendingInvites} pending · {overview.seatsRemaining}{' '}
                seats left
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {formError ? (
        <p className="mb-4 rounded-lg border border-semantic-error/20 bg-semantic-error/5 px-3 py-2 text-sm text-semantic-error">
          {formError}
        </p>
      ) : null}

      {notice ? (
        <p className="mb-4 rounded-lg border border-brand-primary/20 bg-brand-tint px-3 py-2 text-sm text-brand-primary">
          {notice}
        </p>
      ) : null}

      {isAdmin ? (
        <section className="mb-8 rounded-xl border border-border bg-surface-card p-6">
          <h2 className="text-base font-semibold text-text-primary">
            Invite a member
          </h2>
          <form
            onSubmit={handleInvite}
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start"
          >
            <div className="flex-1">
              <input
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setFieldError('');
                }}
                placeholder="teammate@company.com"
                className={`auth-input ${fieldError ? 'auth-input-error' : ''}`}
                disabled={seatsFull || pendingAction === 'invite'}
              />
              {fieldError ? (
                <p className="mt-1.5 text-sm text-semantic-error">
                  {fieldError}
                </p>
              ) : null}
            </div>

            <select
              value={role}
              onChange={(event) =>
                setRole(event.target.value as OrganizationRole)
              }
              className="auth-input sm:w-40"
              disabled={seatsFull || pendingAction === 'invite'}
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>

            <button
              type="submit"
              className="btn-primary sm:w-auto sm:px-6"
              disabled={seatsFull || pendingAction === 'invite'}
            >
              {pendingAction === 'invite' ? 'Inviting...' : 'Send invite'}
            </button>
          </form>
          {seatsFull ? (
            <p className="mt-3 text-xs text-text-muted">
              You have reached your plan&apos;s member limit. Upgrade to invite
              more.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-surface-card">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-text-primary">Members</h2>
        </div>
        <ul className="divide-y divide-border">
          {members.map((member) => {
            const isSelf = member.userId === currentUserId;
            return (
              <li
                key={member.membershipId}
                className="flex items-center justify-between px-6 py-4"
              >
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {member.name}
                    {isSelf ? (
                      <span className="ml-2 text-xs text-text-muted">(you)</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-text-muted">{member.email}</p>
                </div>

                <div className="flex items-center gap-3">
                  {isAdmin && !isSelf ? (
                    <select
                      value={member.role}
                      onChange={(event) =>
                        handleRoleChange(
                          member.userId,
                          event.target.value as OrganizationRole,
                        )
                      }
                      className="auth-input w-28 py-1.5 text-xs"
                      disabled={pendingAction === `role-${member.userId}`}
                    >
                      <option value="MEMBER">Member</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  ) : (
                    <span className="rounded-full bg-brand-tint px-2.5 py-1 text-xs font-medium text-brand-primary">
                      {member.role}
                    </span>
                  )}

                  {isAdmin && !isSelf ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member.userId)}
                      className="text-xs font-medium text-semantic-error hover:underline disabled:opacity-60"
                      disabled={pendingAction === `remove-${member.userId}`}
                    >
                      {pendingAction === `remove-${member.userId}`
                        ? 'Removing...'
                        : 'Remove'}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {isAdmin && invites.length > 0 ? (
        <section className="mt-8 rounded-xl border border-border bg-surface-card">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-base font-semibold text-text-primary">
              Pending invites
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between px-6 py-4"
              >
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {invite.email}
                  </p>
                  <p className="text-xs text-text-muted">
                    {invite.role} · expires{' '}
                    {new Date(invite.expiresAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => copyInviteLink(invite.token)}
                    className="text-xs font-medium text-brand-primary hover:underline"
                  >
                    Copy link
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRevokeInvite(invite.id)}
                    className="text-xs font-medium text-semantic-error hover:underline disabled:opacity-60"
                    disabled={pendingAction === `revoke-${invite.id}`}
                  >
                    {pendingAction === `revoke-${invite.id}`
                      ? 'Revoking...'
                      : 'Revoke'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
