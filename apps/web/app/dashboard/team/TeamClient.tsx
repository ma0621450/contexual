'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyboardIcon } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type TeamClientProps = {
  currentUserId: string;
  isAdmin: boolean;
  members: TeamMember[];
  invites: TeamInvite[];
  overview: TeamOverview | null;
};

type ConfirmAction =
  | { type: 'leave' }
  | { type: 'remove'; userId: string; name: string }
  | { type: 'transfer'; userId: string; name: string };

const PLAN_LABEL: Record<TeamOverview['planTier'], string> = {
  FREE: 'Free',
  STARTER: 'Starter',
  PRO: 'Pro',
  BUSINESS: 'Business',
};

function roleLabel(role: OrganizationRole) {
  return role === 'ADMIN' ? 'Admin' : 'Member';
}

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
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

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
      setConfirm(null);
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
    if (pendingAction) return;
    setPendingAction(`transfer-${targetUserId}`);
    const result = await apiFetch('/onboarding/transfer-admin', {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    });
    if (result.ok) {
      setNotice('Admin access transferred.');
      setConfirm(null);
      refresh();
    } else {
      setFormError(result.error);
    }
    setPendingAction(null);
  }

  async function leaveOrganization() {
    if (pendingAction) return;
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
    setConfirm(null);
  }

  async function runConfirm() {
    if (!confirm) return;
    if (confirm.type === 'leave') await leaveOrganization();
    if (confirm.type === 'remove') await handleRemoveMember(confirm.userId);
    if (confirm.type === 'transfer') await transferAdmin(confirm.userId);
  }

  return (
    <div className="mx-auto w-full max-w-[1118px] px-4 pt-8 pb-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] leading-10 font-semibold tracking-[-1.2px] text-white sm:text-[48px] sm:leading-[56px] sm:tracking-[-1.92px]">
            Team
          </h1>
          <p className="mt-1 text-sm text-[#a1a1aa]">
            Manage your organization&apos;s members and invitations.
          </p>
        </div>
        <Button
          onClick={() => setConfirm({ type: 'leave' })}
          disabled={pendingAction === 'leave'}
          className="h-9 rounded-lg bg-[#ff4d4f] px-4 text-sm font-medium text-white hover:bg-[#ff3336] focus-visible:ring-[#ff4d4f]/40"
        >
          {pendingAction === 'leave' ? 'Leaving…' : 'Leave Organization'}
        </Button>
      </div>

      {formError ? (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-[#d4d4d8]"
        >
          {notice}
        </p>
      ) : null}

      {overview ? (
        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-[18px] leading-6 font-semibold text-white">
                {overview.name}
              </h2>
              <p className="mt-1.5 flex items-center gap-2 text-sm text-[#8b8b93]">
                Plan
                <span className="inline-flex h-5 items-center rounded-full bg-white/10 px-2 text-[11px] text-[#d4d4d8]">
                  {PLAN_LABEL[overview.planTier]}
                </span>
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-sm font-medium text-white">
                {overview.memberCount}/{overview.maxMembers} members
              </p>
              <p className="text-xs text-[#8b8b93]">
                {overview.pendingInvites} pending · {overview.seatsRemaining}{' '}
                {overview.seatsRemaining === 1 ? 'seat' : 'seats'} left
              </p>
            </div>
          </div>
        </section>
      ) : (
        <p role="alert" className="mt-8 text-sm text-destructive">
          The organization summary could not be loaded.
        </p>
      )}

      {isAdmin ? (
        <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6">
          <h2 className="text-[18px] leading-6 font-semibold text-white">
            Invite a member
          </h2>
          <form
            noValidate
            onSubmit={handleInvite}
            className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-start"
          >
            <div className="min-w-0 flex-1">
              <div className="relative">
                <KeyboardIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#8b8b93]" />
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setFieldError('');
                  }}
                  placeholder="Enter email address"
                  aria-label="Email address"
                  aria-invalid={fieldError ? true : undefined}
                  disabled={seatsFull || pendingAction === 'invite'}
                  className="h-10 border-white/10 bg-transparent pl-10"
                />
              </div>
              {fieldError ? (
                <p className="mt-1.5 text-sm text-destructive">{fieldError}</p>
              ) : null}
            </div>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as OrganizationRole)}
              disabled={seatsFull || pendingAction === 'invite'}
            >
              <SelectTrigger
                aria-label="Role"
                className="h-10 w-full rounded-lg border-white/10 bg-[#2a2a2a] lg:w-[120px]"
              >
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
              className="h-10 rounded-lg bg-[#3a3a3a] px-4 text-sm text-white hover:bg-[#4a4a4a]"
            >
              {pendingAction === 'invite' ? 'Inviting…' : 'Send Invite'}
            </Button>
          </form>
          {seatsFull ? (
            <p className="mt-3 text-xs text-[#a1a1aa]">
              You have reached your plan&apos;s member limit. Upgrade to invite
              more.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <h2 className="px-5 py-4 text-[18px] leading-6 font-semibold text-white sm:px-6">
          Members
        </h2>
        <ul>
          {members.map((member) => {
            const isSelf = member.userId === currentUserId;
            return (
              <li
                key={member.membershipId}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-3 sm:px-6"
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-white">
                    {member.name}
                    {isSelf ? (
                      <span className="ml-2 text-xs font-normal text-[#a1a1aa]">
                        (you)
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-sm text-[#a1a1aa]">
                    {member.email}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {member.suspended ? (
                    <span className="inline-flex h-7 items-center rounded-full border border-destructive/30 px-3 text-xs text-destructive">
                      Suspended
                    </span>
                  ) : null}
                  {isAdmin && !isSelf ? (
                    <Select
                      value={member.role}
                      onValueChange={(value) =>
                        handleRoleChange(member.userId, value as OrganizationRole)
                      }
                      disabled={pendingAction === `role-${member.userId}`}
                    >
                      <SelectTrigger
                        aria-label={`Role for ${member.name}`}
                        className="h-7 w-[92px] rounded-full border-white/10 bg-[#2c2c2c] text-xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MEMBER">Member</SelectItem>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="inline-flex h-7 items-center rounded-full bg-[#2c2c2c] px-3 text-xs text-[#d4d4d8]">
                      {roleLabel(member.role)}
                    </span>
                  )}
                  {isAdmin && !isSelf ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[#a1a1aa] hover:bg-white/5 hover:text-white"
                        onClick={() =>
                          setConfirm({
                            type: 'transfer',
                            userId: member.userId,
                            name: member.name,
                          })
                        }
                        disabled={pendingAction === `transfer-${member.userId}`}
                      >
                        Transfer admin
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() =>
                          setConfirm({
                            type: 'remove',
                            userId: member.userId,
                            name: member.name,
                          })
                        }
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
      </section>

      {isAdmin && invites.length > 0 ? (
        <section className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <h2 className="px-5 py-4 text-[18px] leading-6 font-semibold text-white sm:px-6">
            Pending invites
          </h2>
          <ul>
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-3 sm:px-6"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{invite.email}</p>
                  <p className="text-sm text-[#a1a1aa]">
                    {roleLabel(invite.role)} · expires{' '}
                    <time dateTime={invite.expiresAt}>
                      {new Date(invite.expiresAt).toLocaleDateString()}
                    </time>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[#a1a1aa] hover:bg-white/5 hover:text-white"
                    onClick={() => void copyInviteLink(invite.token)}
                  >
                    Copy link
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void handleRevokeInvite(invite.id)}
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
        </section>
      ) : null}

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open && pendingAction === null) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.type === 'leave'
                ? 'Leave organization?'
                : confirm?.type === 'transfer'
                  ? 'Transfer admin access?'
                  : 'Remove member?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.type === 'leave'
                ? 'You may lose access to this organization immediately.'
                : confirm?.type === 'transfer'
                  ? `${confirm.name} will become the organization admin.`
                  : confirm?.type === 'remove'
                    ? `${confirm.name} will lose access to this organization.`
                    : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingAction !== null}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={pendingAction !== null}
              onClick={(event) => {
                event.preventDefault();
                void runConfirm();
              }}
            >
              {confirm?.type === 'leave'
                ? 'Leave'
                : confirm?.type === 'transfer'
                  ? 'Transfer'
                  : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
