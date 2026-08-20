'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@contexual/ui';
import { LogOutIcon } from 'lucide-react';
import { apiPost } from '@/lib/api/client';

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await apiPost('/platform/auth/logout');
    } catch {
      // Clearing the local session matters more than the response here.
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => void signOut()}
      disabled={pending}
    >
      <LogOutIcon />
      Sign out
    </Button>
  );
}
