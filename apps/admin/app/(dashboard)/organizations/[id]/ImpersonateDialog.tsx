'use client';

import { useState } from 'react';
import { Button, Card, CardContent, Input, Label } from '@contexual/ui';
import { UserCogIcon } from 'lucide-react';
import { ApiError, apiPost } from '@/lib/api/client';
import type { ImpersonationStartResponse } from '@/lib/api/types';

export function ImpersonateDialog({
  organizationId,
  members,
}: {
  organizationId: string;
  members: { userId: string; name: string; email: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState(members[0]?.userId ?? '');
  const [reason, setReason] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const result = await apiPost<ImpersonationStartResponse>(
        '/platform/impersonation',
        { userId, organizationId, reason, durationMinutes },
      );
      window.open(result.redirectUrl, '_blank', 'noopener,noreferrer');
      setOpen(false);
      setReason('');
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Unable to start impersonation',
      );
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserCogIcon />
        Impersonate
      </Button>
    );
  }

  return (
    <Card className="w-full">
      <CardContent>
        <form onSubmit={start} className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-semibold">Impersonate a member</h3>
            <p className="text-sm text-muted-foreground">
              The session is read-limited, time-boxed, and recorded in both the
              platform log and this organization&rsquo;s own audit trail.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="impersonate-user">Member</Label>
            <select
              id="impersonate-user"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
              required
            >
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name} ({member.email})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="impersonate-reason">Reason</Label>
            <Input
              id="impersonate-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ticket #123 — reproducing upload failure"
              minLength={10}
              maxLength={500}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="impersonate-duration">Duration (minutes)</Label>
            <Input
              id="impersonate-duration"
              type="number"
              min={5}
              max={60}
              value={durationMinutes}
              onChange={(event) =>
                setDurationMinutes(Number(event.target.value))
              }
              required
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending || !userId}>
              {pending ? 'Starting…' : 'Start session'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
