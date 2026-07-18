'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import type { OrganizationMembership } from '@/lib/api/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Props = {
  organizations: OrganizationMembership[];
  activeOrganizationId: string;
};

export function SuspendedAccess({
  organizations,
  activeOrganizationId,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const active = organizations.find((org) => org.id === activeOrganizationId);
  const available = organizations.filter((org) => !org.suspended);

  async function switchTo(organizationId: string) {
    setPending(organizationId);
    setError('');
    const result = await apiFetch<{ redirectTo?: string }>(
      '/onboarding/switch-organization',
      {
        method: 'POST',
        body: JSON.stringify({ organizationId }),
      },
    );
    if (result.ok) {
      router.replace(result.data.redirectTo ?? '/dashboard');
      router.refresh();
      return;
    }
    setError(result.error);
    setPending(null);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Workspace access suspended</CardTitle>
            <Badge variant="destructive">Suspended</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your access to {active?.name ?? 'this workspace'} is suspended.
            Workspace features are unavailable until an administrator restores
            your membership.
          </p>
          {available.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Switch to an active workspace
              </p>
              {available.map((organization) => (
                <Button
                  key={organization.id}
                  variant="outline"
                  className="w-full justify-start"
                  disabled={pending !== null}
                  onClick={() => switchTo(organization.id)}
                >
                  {pending === organization.id
                    ? 'Switching…'
                    : organization.name}
                </Button>
              ))}
            </div>
          ) : (
            <Button onClick={() => router.push('/onboarding?action=create')}>
              Create another organization
            </Button>
          )}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
    </main>
  );
}
