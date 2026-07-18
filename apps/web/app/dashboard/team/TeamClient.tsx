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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
      setNotice(
        'Invitation sent. The invitee will receive an email with a join link.',
      );
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

  async function transferAdmin(targetUserId: string) {
    if (
      pendingAction ||
      !window.confirm('Transfer your admin access to this member?')
    ) {
      return;
    }
    setPendingAction(`transfer-${targetUserId}`);
    const result = await apiFetch('/onboarding/transfer-admin', {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    });
    if (result.ok) {
      setNotice('Admin access transferred.');
      refresh();
    } else {
      setFormError(result.error);
    }
    setPendingAction(null);
  }

  async function leaveOrganization() {
    if (
      pendingAction ||
      !window.confirm(
        'Leave this organization? You may lose access immediately.',
      )
    ) {
      return;
    }
    setPendingAction('leave');
    const result = await apiFetch<{ redirectTo?: string }>(
      '/onboarding/leave-organization',
      { method: 'POST' },
    );
    if (result.ok) {
      router.push(result.data.redirectTo ?? '/onboarding');
      router.refresh();
      return;
    }
    setFormError(result.error);
    setPendingAction(null);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Team</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your organization&apos;s members and invitations.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={leaveOrganization}
          disabled={pendingAction === 'leave'}
          className="text-destructive"
        >
          {pendingAction === 'leave' ? 'Leaving…' : 'Leave organization'}
        </Button>
      </div>

      {overview ? (
        <Card className="mb-6 py-5">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{overview.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Plan: {overview.planTier}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">
                {overview.memberCount} / {overview.maxMembers} members
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {overview.pendingInvites} pending · {overview.seatsRemaining}{' '}
                seats left
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {formError ? (
        <p className="mb-4 rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      {notice ? (
        <p className="mb-4 rounded-lg border border-border bg-accent px-3 py-2 text-sm text-accent-foreground">
          {notice}
        </p>
      ) : null}

      {isAdmin ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Invite a member</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleInvite}
              className="flex flex-col gap-3 sm:flex-row sm:items-start"
            >
              <div className="flex-1">
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setFieldError('');
                  }}
                  placeholder="teammate@company.com"
                  aria-invalid={fieldError ? true : undefined}
                  disabled={seatsFull || pendingAction === 'invite'}
                />
                {fieldError ? (
                  <p className="mt-1.5 text-sm text-destructive">
                    {fieldError}
                  </p>
                ) : null}
              </div>

              <Select
                value={role}
                onValueChange={(value) => setRole(value as OrganizationRole)}
                disabled={seatsFull || pendingAction === 'invite'}
              >
                <SelectTrigger className="sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>

              <Button
                type="submit"
                disabled={seatsFull || pendingAction === 'invite'}
              >
                {pendingAction === 'invite' ? 'Inviting…' : 'Send invite'}
              </Button>
            </form>
            {seatsFull ? (
              <p className="mt-3 text-xs text-muted-foreground">
                You have reached your plan&apos;s member limit. Upgrade to
                invite more.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="gap-0 py-0">
        <div className="border-b border-border px-6 py-4">
          <h3 className="font-semibold">Members</h3>
        </div>
        <ul className="divide-y divide-border">
          {members.map((member) => {
            const isSelf = member.userId === currentUserId;
            return (
              <li
                key={member.membershipId}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
              >
                <div>
                  <p className="text-sm font-medium">
                    {member.name}
                    {isSelf ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (you)
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {member.email}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {member.suspended ? (
                    <Badge variant="destructive">Suspended</Badge>
                  ) : null}
                  {isAdmin && !isSelf ? (
                    <Select
                      value={member.role}
                      onValueChange={(value) =>
                        handleRoleChange(
                          member.userId,
                          value as OrganizationRole,
                        )
                      }
                      disabled={pendingAction === `role-${member.userId}`}
                    >
                      <SelectTrigger size="sm" className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MEMBER">Member</SelectItem>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary">{member.role}</Badge>
                  )}

                  {isAdmin && !isSelf ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => transferAdmin(member.userId)}
                        disabled={pendingAction === `transfer-${member.userId}`}
                      >
                        Transfer admin
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleRemoveMember(member.userId)}
                        disabled={pendingAction === `remove-${member.userId}`}
                      >
                        {pendingAction === `remove-${member.userId}`
                          ? 'Removing…'
                          : 'Remove'}
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {isAdmin && invites.length > 0 ? (
        <Card className="mt-6 gap-0 py-0">
          <div className="border-b border-border px-6 py-4">
            <h3 className="font-semibold">Pending invites</h3>
          </div>
          <ul className="divide-y divide-border">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
              >
                <div>
                  <p className="text-sm font-medium">{invite.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {invite.role} · expires{' '}
                    {new Date(invite.expiresAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyInviteLink(invite.token)}
                  >
                    Copy link
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleRevokeInvite(invite.id)}
                    disabled={pendingAction === `revoke-${invite.id}`}
                  >
                    {pendingAction === `revoke-${invite.id}`
                      ? 'Revoking…'
                      : 'Revoke'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
