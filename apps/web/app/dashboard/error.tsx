'use client';

import { TriangleAlertIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <Card>
        <CardHeader>
          <span className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <TriangleAlertIcon className="size-5" />
          </span>
          <CardTitle>Workspace data is unavailable</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            We could not reach the API. Your data has not been replaced or
            removed. Check the service and try again.
          </p>
          <Button className="mt-5" onClick={reset}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
