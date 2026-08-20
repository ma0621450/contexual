'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2Icon, ShieldAlertIcon } from 'lucide-react';

export function ImpersonateRedeem({ token }: { token: string | null }) {
  const router = useRouter();
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const redeemed = useRef(false);

  useEffect(() => {
    if (!token || redeemed.current) return;
    redeemed.current = true;

    async function redeem() {
      try {
        const response = await fetch('/api/platform/impersonation/redeem', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (!response.ok) {
          setRedeemError('This support link is invalid or has expired.');
          return;
        }

        router.replace('/dashboard');
        router.refresh();
      } catch {
        setRedeemError('Could not start the support session.');
      }
    }

    void redeem();
  }, [token, router]);

  const error = token
    ? redeemError
    : 'This link is missing its access token.';

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        {error ? (
          <>
            <span className="flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <ShieldAlertIcon className="size-5" />
            </span>
            <h1 className="text-lg font-semibold tracking-tight">
              Support session unavailable
            </h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </>
        ) : (
          <>
            <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Starting support session…
            </p>
          </>
        )}
      </div>
    </div>
  );
}
