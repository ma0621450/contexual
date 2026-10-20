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
    <div className="mx-auto w-full max-w-[1118px] px-4 pt-14 pb-10 sm:px-6">
    <form onSubmit={saveProfile}>
      <div className="flex flex-col items-center text-center">
        <button
          type="button"
          aria-label="Profile photo"
          onClick={() => setPhotoMessage('Profile photos are not stored yet.')}
          className="group relative flex size-[88px] items-center justify-center overflow-hidden rounded-full bg-[#2a2a2a] text-2xl font-semibold text-white"
        >
          <span>{initials(name)}</span>
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
            <CameraIcon className="size-5" />
          </span>
        </button>
        <h1 className="mt-4 text-[18px] leading-6 font-bold text-white">
          Profile Picture
        </h1>
        <p className="mt-1 text-sm text-[#737373]">
          Update your name and password.
        </p>
        {photoMessage ? (
          <p className="mt-2 text-sm text-[#a1a1aa]">{photoMessage}</p>
        ) : null}
      </div>

      <section className="mt-12 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        <h2 className="bg-white/[0.03] px-4 py-3 text-[13px] font-medium text-white">
          Account Information
        </h2>
        <div className="flex items-center justify-between gap-4 px-4 py-2">
          <Label htmlFor="settings-name" className="text-[13px] font-normal text-white">
            Name
          </Label>
          <Input
            id="settings-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-8 max-w-[260px] border-0 bg-transparent px-0 text-right text-[13px] text-[#737373] shadow-none focus-visible:text-white focus-visible:ring-0"
          />
        </div>
        <div className="mx-4 flex items-center justify-between gap-4 border-t border-white/[0.06] py-3.5">
          <span className="text-[13px] text-white">Email</span>
          <span className="truncate text-[13px] text-white">{email}</span>
        </div>
      </section>

      <section className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        <h2 className="bg-white/[0.03] px-4 py-3 text-[13px] font-medium text-white">
          Account Security
        </h2>
        <div className="flex items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-[13px] text-white">Password</p>
            <p className="mt-0.5 text-xs text-[#5c5c5c]">Set a Unique Password</p>
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
        className="mt-3 h-9 min-w-[120px] rounded-lg border border-white/10 bg-[#3a3a3a] px-5 text-white hover:bg-[#444444]"
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
