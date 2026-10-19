'use client';

import { useRouter } from 'next/navigation';
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from 'lucide-react';
import type { OrganizationMembership } from '@/lib/api/server';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useSwitchOrganization } from '@/components/dashboard/use-switch-organization';
import { Badge } from '@/components/ui/badge';
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
  compact?: boolean;
};

export function OrganizationSwitcher({
  organizations,
  activeOrganizationId,
  compact = false,
}: Props) {
  const router = useRouter();
  const { switching, switchOrganization } = useSwitchOrganization();
  const active = organizations.find((org) => org.id === activeOrganizationId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          disabled={switching}
          aria-label={
            compact
              ? `Switch organization, ${active?.name ?? 'none selected'}`
              : undefined
          }
          className={cn(
            'h-auto text-shell-text hover:bg-shell-hover hover:text-shell-text focus-visible:ring-2 focus-visible:ring-white/40',
            compact
              ? 'size-10 justify-center rounded-[10px] px-0'
              : 'w-full justify-between gap-2 rounded-[10px] px-2 py-2 text-left',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-shell-active text-xs font-medium text-shell-text">
              {active?.name?.charAt(0).toUpperCase() ?? 'P'}
            </span>
            {compact ? null : (
              <span className="truncate text-sm font-medium">
                {switching
                  ? 'Switching…'
                  : (active?.name ?? 'Select organization')}
              </span>
            )}
          </span>
          {compact ? null : (
            <ChevronsUpDownIcon className="size-4 shrink-0 text-shell-muted" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {organizations.map((organization) => (
          <DropdownMenuItem
            key={organization.id}
            disabled={organization.suspended}
            onSelect={() =>
              void switchOrganization(organization.id, activeOrganizationId)
            }
            className="gap-2"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
              {organization.name.charAt(0).toUpperCase()}
            </span>
            <span className="truncate">{organization.name}</span>
            {organization.suspended ? (
              <Badge variant="destructive" className="ml-auto text-[10px]">
                Suspended
              </Badge>
            ) : null}
            <CheckIcon
              className={cn(
                organization.suspended ? 'size-4' : 'ml-auto size-4',
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
