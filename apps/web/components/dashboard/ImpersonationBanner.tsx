'use client';

import { useState } from 'react';
import { UserCogIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ImpersonationBanner() {
  const [ending, setEnding] = useState(false);

  async function endSession() {
    setEnding(true);
    try {
      await fetch('/api/platform/impersonation/end', {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      window.location.href = '/login';
    }
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-warning px-4 py-2 text-center text-sm font-medium text-warning-foreground"
    >
      <span className="flex items-center gap-2">
        <UserCogIcon className="size-4" />
        You are viewing this workspace as a support session. Activity is
        recorded.
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => void endSession()}
        disabled={ending}
        className="border-warning-foreground/30 bg-transparent text-warning-foreground hover:bg-warning-foreground/10"
      >
        {ending ? 'Ending…' : 'End session'}
      </Button>
    </div>
  );
}
