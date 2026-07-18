'use client';

import { TriangleAlertIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <TriangleAlertIcon className="mx-auto size-10 text-destructive" />
        <h1 className="mt-4 text-xl font-semibold">Service unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We could not load data from the API. Check the service and try again.
        </p>
        <Button className="mt-5" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
