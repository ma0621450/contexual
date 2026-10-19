'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';

export function useSwitchOrganization() {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  async function switchOrganization(organizationId: string, currentId: string) {
    if (organizationId === currentId || switching) return;
    setSwitching(true);
    const result = await apiFetch<{ redirectTo?: string }>(
      '/onboarding/switch-organization',
      {
        method: 'POST',
        body: JSON.stringify({ organizationId }),
      },
    );

    if (result.ok) {
      router.push(result.data.redirectTo ?? '/dashboard');
      router.refresh();
      return true;
    }
    toast.error(result.error);
    setSwitching(false);
    return false;
  }

  return { switching, switchOrganization };
}
