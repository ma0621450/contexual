import { Suspense } from 'react';
import { ResetPasswordClient } from './ResetPasswordClient';

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center text-sm text-text-muted">
          Loading...
        </main>
      }
    >
      <ResetPasswordClient />
    </Suspense>
  );
}
