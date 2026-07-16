'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import type { OrganizationMembership } from '@/lib/api/server';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Props = {
  organizations: OrganizationMembership[];
  activeOrganizationId: string;
};

export function OrganizationSwitcher({
  organizations,
  activeOrganizationId,
}: Props) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const active = organizations.find((org) => org.id === activeOrganizationId);

  async function switchOrganization(organizationId: string) {
    if (organizationId === activeOrganizationId || switching) return;
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
      return;
    }
    setSwitching(false);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          disabled={switching}
          className="h-auto w-full justify-between gap-2 px-2 py-2 text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
              {active?.name?.charAt(0).toUpperCase() ?? 'C'}
            </span>
            <span className="truncate text-sm font-medium">
              {active?.name ?? 'Select organization'}
            </span>
          </span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {organizations.map((organization) => (
          <DropdownMenuItem
            key={organization.id}
            disabled={organization.suspended}
            onSelect={() => switchOrganization(organization.id)}
            className="gap-2"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
              {organization.name.charAt(0).toUpperCase()}
            </span>
            <span className="truncate">
              {organization.name}
              {organization.suspended ? ' (suspended)' : ''}
            </span>
            <CheckIcon
              className={cn(
                'ml-auto size-4',
                organization.id === activeOrganizationId
                  ? 'opacity-100'
                  : 'opacity-0',
              )}
            />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => router.push('/onboarding?action=create')}
          className="gap-2"
        >
          <PlusIcon className="size-4" />
          Create organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
