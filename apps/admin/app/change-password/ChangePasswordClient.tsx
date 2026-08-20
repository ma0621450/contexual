'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardContent, Input, Label } from '@contexual/ui';
import { KeyRoundIcon } from 'lucide-react';
import { ApiError, apiPost } from '@/lib/api/client';

const MIN_LENGTH = 12;

export function ChangePasswordClient({ email }: { email: string }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (newPassword.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The two new passwords do not match.');
      return;
    }

    setPending(true);
    try {
      await apiPost('/platform/auth/password', {
        currentPassword,
        newPassword,
      });
      router.replace('/organizations');
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Unable to change password',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRoundIcon className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              Choose a new password
            </h1>
            <p className="text-sm text-muted-foreground">
              {email} is using a temporary password. Replace it to continue.
            </p>
          </div>
        </div>

        <Card>
          <CardContent>
            <form onSubmit={submit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="current">Temporary password</Label>
                <Input
                  id="current"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  disabled={pending}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="next">New password</Label>
                <Input
                  id="next"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={MIN_LENGTH}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  disabled={pending}
                />
                <p className="text-xs text-muted-foreground">
                  At least {MIN_LENGTH} characters.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={pending}
                />
              </div>

              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Save and continue'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
