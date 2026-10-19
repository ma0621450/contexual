'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CameraIcon } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import {
  changePasswordSchema,
  updateProfileSchema,
} from '@/lib/validations/auth';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  name: string;
  email: string;
};

function initials(name: string) {
  const letters = name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return letters || 'U';
}

export function SettingsClient({ name: initialName, email }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [photoMessage, setPhotoMessage] = useState('');
  const [pending, setPending] = useState<'profile' | 'password' | null>(null);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    const parsed = updateProfileSchema.safeParse({ name });
    if (!parsed.success) {
      setProfileError(parsed.error.issues[0]?.message ?? 'Invalid name');
      setProfileMessage('');
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
    <div className="mx-auto w-full max-w-[720px] px-4 pt-10 pb-10 sm:px-6">
    <form onSubmit={saveProfile}>
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <div className="flex size-24 items-center justify-center rounded-full bg-[#2a2a2a] text-2xl font-semibold text-white">
            {initials(name)}
          </div>
          <button
            type="button"
            aria-label="Profile photo"
            onClick={() =>
              setPhotoMessage('Profile photos are not stored yet.')
            }
            className="absolute right-0 bottom-0 flex size-8 items-center justify-center rounded-full border border-white/10 bg-[#1c1c1c] text-white"
          >
            <CameraIcon className="size-3.5" />
          </button>
        </div>
        <h1 className="mt-4 text-[22px] leading-7 font-semibold text-white">
          Profile Picture
        </h1>
        <p className="mt-1 text-sm text-[#8b8b93]">
          Update your name and password.
        </p>
        {photoMessage ? (
          <p className="mt-2 text-sm text-[#a1a1aa]">{photoMessage}</p>
        ) : null}
      </div>

      <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-2 sm:px-6">
        <h2 className="border-b border-white/10 py-4 text-sm font-medium text-white">
          Account Information
        </h2>
        <div className="flex items-center justify-between gap-4 border-b border-white/10 py-3">
          <Label htmlFor="settings-name" className="text-sm text-white">
            Name
          </Label>
          <Input
            id="settings-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-8 max-w-[240px] border-0 bg-transparent px-0 text-right text-sm text-[#d4d4d8] shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="flex items-center justify-between gap-4 py-4">
          <span className="text-sm text-white">Email</span>
          <span className="truncate text-sm text-[#d4d4d8]">{email}</span>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-2 sm:px-6">
        <h2 className="border-b border-white/10 py-4 text-sm font-medium text-white">
          Account Information
        </h2>
        <div className="flex items-center justify-between gap-4 py-4">
          <div>
            <p className="text-sm text-white">Password</p>
            <p className="mt-0.5 text-xs text-[#8b8b93]">Set a Unique Password</p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setPasswordError('');
              setPasswordOpen(true);
            }}
            className="h-9 rounded-lg bg-[#2a2a2a] px-4 text-white hover:bg-[#333333]"
          >
            Change Password
          </Button>
        </div>
      </section>

      {profileError ? (
        <p className="mt-4 text-sm text-destructive">{profileError}</p>
      ) : null}
      {profileMessage ? (
        <p className="mt-4 text-sm text-[#d4d4d8]">{profileMessage}</p>
      ) : null}

      <Button
        type="submit"
        disabled={pending !== null}
        className="mt-5 h-9 rounded-lg bg-[#2a2a2a] px-4 text-white hover:bg-[#333333]"
      >
        {pending === 'profile' ? 'Saving…' : 'Save changes'}
      </Button>
    </form>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent
          className="border-white/10 bg-[#161616] sm:max-w-[420px]"
          style={{ backgroundColor: '#161616' }}
        >
          <DialogHeader>
            <DialogTitle className="text-white">Change Password</DialogTitle>
            <DialogDescription className="text-[#a1a1aa]">
              Changing your password signs you out of every session.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={changePassword}>
            <div className="space-y-1.5">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="border-white/10 bg-transparent"
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
                className="border-white/10 bg-transparent"
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
                className="border-white/10 bg-transparent"
              />
            </div>
            {passwordError ? (
              <p className="text-sm text-destructive">{passwordError}</p>
            ) : null}
            <Button
              type="submit"
              disabled={pending !== null}
              className="h-9 rounded-lg bg-white px-4 text-[#111111] hover:bg-white/90"
            >
              {pending === 'password' ? 'Changing…' : 'Change Password'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
