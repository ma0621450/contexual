'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import {
  changePasswordSchema,
  updateProfileSchema,
} from '@/lib/validations/auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  name: string;
  email: string;
};

export function SettingsClient({ name: initialName, email }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [pending, setPending] = useState<'profile' | 'password' | null>(null);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    const parsed = updateProfileSchema.safeParse({ name });
    if (!parsed.success) {
      setProfileError(parsed.error.issues[0]?.message ?? 'Invalid name');
      return;
    }
    setPending('profile');
    setProfileError('');
    setProfileMessage('');
    const result = await apiFetch('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(parsed.data),
    }).catch(() => ({ ok: false as const, error: 'Unable to update profile' }));
    if (result.ok) {
      setName(parsed.data.name);
      setProfileMessage('Profile updated.');
      router.refresh();
    } else {
      setProfileError(result.error);
    }
    setPending(null);
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    const parsed = changePasswordSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (!parsed.success) {
      setPasswordError(parsed.error.issues[0]?.message ?? 'Invalid password');
      return;
    }
    setPending('password');
    setPasswordError('');
    const result = await apiFetch<{ requiresLogin: boolean }>(
      '/auth/change-password',
      {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: parsed.data.currentPassword,
          newPassword: parsed.data.newPassword,
        }),
      },
    ).catch(() => ({ ok: false as const, error: 'Unable to change password' }));
    if (result.ok) {
      router.replace('/login?passwordChanged=1');
      router.refresh();
      return;
    }
    setPasswordError(result.error);
    setPending(null);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Account settings
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Update your profile and account security.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Your email address cannot be changed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={saveProfile}>
            <div className="space-y-1.5">
              <Label htmlFor="settings-name">Name</Label>
              <Input
                id="settings-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settings-email">Email</Label>
              <Input id="settings-email" value={email} disabled readOnly />
            </div>
            {profileError ? (
              <p className="text-sm text-destructive">{profileError}</p>
            ) : null}
            {profileMessage ? (
              <p className="text-sm text-primary">{profileMessage}</p>
            ) : null}
            <Button disabled={pending !== null} type="submit">
              {pending === 'profile' ? 'Saving…' : 'Save profile'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Changing your password signs you out of every session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={changePassword}>
            <div className="space-y-1.5">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
            {passwordError ? (
              <p className="text-sm text-destructive">{passwordError}</p>
            ) : null}
            <Button disabled={pending !== null} type="submit">
              {pending === 'password' ? 'Changing…' : 'Change password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
