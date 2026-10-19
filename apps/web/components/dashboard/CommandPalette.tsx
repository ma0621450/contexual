'use client';

/* Figma SVGs are rendered at the width and height authored in the file. */
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { OrganizationMembership } from '@/lib/api/server';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { signOut } from '@/components/dashboard/LogoutButton';
import { visibleNav } from '@/components/dashboard/dashboard-nav';
import { useSwitchOrganization } from '@/components/dashboard/use-switch-organization';

type Action = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon?: string;
  disabled?: boolean;
  run: () => void;
};

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  organizations: OrganizationMembership[];
  activeOrganizationId: string;
  shortcutLabel: string;
};

export function CommandPalette({
  open,
  onOpenChange,
  isAdmin,
  organizations,
  activeOrganizationId,
  shortcutLabel,
}: CommandPaletteProps) {
  const router = useRouter();
  const { switching, switchOrganization } = useSwitchOrganization();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery('');
      setIndex(0);
    }
  }

  const actions = useMemo<Action[]>(() => {
    const go = (href: string) => {
      onOpenChange(false);
      router.push(href);
    };
    const navigation: Action[] = visibleNav(isAdmin).map((item) => ({
      id: item.href,
      group: 'Navigation',
      label: item.label,
      icon: item.icon,
      run: () => go(item.href),
    }));
    const workspaces: Action[] = organizations.map((organization) => ({
      id: `org-${organization.id}`,
      group: 'Organizations',
      label: organization.name,
      hint: organization.suspended
        ? 'Suspended'
        : organization.id === activeOrganizationId
          ? 'Current'
          : 'Switch',
      disabled: organization.suspended || switching,
      run: () => {
        if (organization.id === activeOrganizationId) {
          onOpenChange(false);
          return;
        }
        void switchOrganization(organization.id, activeOrganizationId).then(
          (switched) => {
            if (switched) onOpenChange(false);
          },
        );
      },
    }));
    const account: Action[] = [
      {
        id: 'create-organization',
        group: 'Account',
        label: 'Create organization',
        run: () => go('/onboarding?action=create'),
      },
      {
        id: 'sign-out',
        group: 'Account',
        label: signingOut ? 'Signing out…' : 'Log out',
        disabled: signingOut,
        run: () => {
          if (signingOut) return;
          setSigningOut(true);
          void signOut().then((result) => {
            if (result.ok) {
              router.replace('/login');
              router.refresh();
              return;
            }
            toast.error('Could not log out. Check your connection and try again.');
            setSigningOut(false);
          });
        },
      },
    ];
    return [...navigation, ...workspaces, ...account];
  }, [
    activeOrganizationId,
    isAdmin,
    onOpenChange,
    organizations,
    router,
    signingOut,
    switchOrganization,
    switching,
  ]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return actions;
    return actions.filter((action) =>
      `${action.group} ${action.label} ${action.hint ?? ''}`
        .toLowerCase()
        .includes(needle),
    );
  }, [actions, query]);

  const selected = Math.min(index, Math.max(filtered.length - 1, 0));

  const groups = filtered.reduce<Array<{ name: string; items: Action[] }>>(
    (list, action) => {
      const current = list.at(-1);
      if (current?.name === action.group) current.items.push(action);
      else list.push({ name: action.group, items: [action] });
      return list;
    },
    [],
  );

  function choose(action: Action | undefined) {
    if (!action || action.disabled) return;
    action.run();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden border-shell-line bg-raised p-0 sm:max-w-md">
        <DialogTitle className="sr-only">Search the workspace</DialogTitle>
        <DialogDescription className="sr-only">
          Jump to a page, switch organization, or sign out. {shortcutLabel}
        </DialogDescription>
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setIndex((current) =>
                Math.min(filtered.length - 1, current + 1),
              );
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setIndex((current) => Math.max(0, current - 1));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              choose(filtered[selected]);
            }
          }}
          placeholder="Search anything..."
          aria-label="Search anything"
          aria-activedescendant={filtered[selected]?.id}
          className="h-12 w-full border-b border-shell-line bg-transparent px-4 text-sm text-shell-text outline-none placeholder:text-shell-muted"
        />
        <div className="max-h-80 overflow-y-auto p-2" role="listbox">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-shell-muted">
              No matching actions.
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.name} className="mb-2 last:mb-0">
                <p className="px-2 py-1 text-[11px] font-medium tracking-wide text-shell-muted uppercase">
                  {group.name}
                </p>
                {group.items.map((action) => {
                  const position = filtered.indexOf(action);
                  const active = position === selected;
                  return (
                    <button
                      key={action.id}
                      id={action.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      disabled={action.disabled}
                      onMouseEnter={() => setIndex(position)}
                      onClick={() => choose(action)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-left text-sm text-shell-text outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50',
                        active ? 'bg-shell-active' : 'hover:bg-shell-hover',
                      )}
                    >
                      {action.icon ? (
                        <img
                          src={action.icon}
                          alt=""
                          width={20}
                          height={20}
                        />
                      ) : (
                        <span className="size-5" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {action.label}
                      </span>
                      {action.hint ? (
                        <span className="text-xs text-shell-muted">
                          {action.hint}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
