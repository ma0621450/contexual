import { Suspense } from 'react';
import { ResetPasswordClient } from './ResetPasswordClient';

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
          Loading…
        </main>
      }
    >
      <ResetPasswordClient />
    </Suspense>
  );
}
