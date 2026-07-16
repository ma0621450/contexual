'use client';

import { LogoutButton } from '@/components/dashboard/LogoutButton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type UserMenuProps = {
  name: string;
  email: string;
  role: string;
};

export function UserMenu({ name, email, role }: UserMenuProps) {
  const initials = name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <Avatar className="size-8 border border-border">
            <AvatarFallback>{initials || 'U'}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">{name}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {email}
          </span>
          <span className="mt-1 w-fit rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground uppercase tracking-wide">
            {role}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <LogoutButton />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
