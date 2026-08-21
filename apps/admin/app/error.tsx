'use client';

import { TriangleAlertIcon } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@contexual/ui';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl items-center px-4 sm:px-6">
      <Card className="w-full">
        <CardHeader>
          <span className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <TriangleAlertIcon className="size-5" />
          </span>
          <CardTitle>Platform data is unavailable</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            We could not reach the platform API. In development this usually
            means the API has not finished starting yet. No data has been
            changed.
          </p>
          {error.digest ? (
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              Reference {error.digest}
            </p>
          ) : null}
          <Button className="mt-5" onClick={reset}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
