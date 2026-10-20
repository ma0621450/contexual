'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { KeyboardIcon } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import { parseInviteToken } from './overview-model';

export function JoinInviteForm() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = parseInviteToken(value);
    if (!token) {
      setError('Enter an invite link or code.');
      return;
    }
    setPending(true);
    setError('');
    const result = await apiFetch<{ redirectTo?: string }>(
      '/onboarding/join-organization',
      {
        method: 'POST',
        body: JSON.stringify({ token }),
      },
    );
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.push(result.data.redirectTo ?? '/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={(event) => onSubmit(event)} className="w-full">
      <h2 className="text-[18px] leading-7 font-semibold tracking-[-0.36px] text-white">
        Join a workspace
      </h2>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <KeyboardIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-shell-muted"
          />
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Enter code or link"
            aria-label="Invite code or link"
            disabled={pending}
            className="h-10 w-full rounded-[10px] border border-shell-line bg-shell-raised pr-3 pl-10 text-sm text-white outline-none placeholder:text-shell-muted focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-60"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="h-10 min-w-[58px] rounded-[10px] bg-[#2a2a2a] px-5 text-sm font-medium text-white outline-none hover:bg-[#333333] focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-60"
        >
          {pending ? 'Joining…' : 'Join'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger-soft">
          {error}
        </p>
      ) : null}
    </form>
  );
}
