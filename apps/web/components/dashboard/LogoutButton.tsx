'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOutIcon } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout(event: Event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);

    const result = await apiFetch<{ ok: true }>('/auth/logout', {
      method: 'POST',
    }).catch(() => ({ ok: false as const, error: 'Unable to reach server' }));

    if (result.ok) {
      router.replace('/login');
      router.refresh();
      return;
    }

    toast.error('Could not log out. Check your connection and try again.');
    setLoading(false);
  }

  return (
    <DropdownMenuItem
      variant="destructive"
      disabled={loading}
      onSelect={handleLogout}
      className="gap-2"
    >
      <LogOutIcon className="size-4" />
      {loading ? 'Signing out…' : 'Log out'}
    </DropdownMenuItem>
  );
}
