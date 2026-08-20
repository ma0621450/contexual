'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Input } from '@contexual/ui';
import { SearchIcon } from 'lucide-react';

const PLAN_TIERS = ['FREE', 'STARTER', 'PRO', 'BUSINESS'] as const;

export function OrganizationFilters({
  search,
  planTier,
}: {
  search: string;
  planTier: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(search);

  function apply(nextSearch: string, nextPlanTier: string) {
    const query = new URLSearchParams();
    if (nextSearch) query.set('search', nextSearch);
    if (nextPlanTier) query.set('planTier', nextPlanTier);
    const suffix = query.toString();
    router.push(`/organizations${suffix ? `?${suffix}` : ''}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <form
        className="relative flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          apply(value.trim(), planTier);
        }}
      >
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search by name or slug"
          aria-label="Search organizations"
          className="pl-9"
        />
      </form>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={planTier === '' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => apply(value.trim(), '')}
        >
          All
        </Button>
        {PLAN_TIERS.map((tier) => (
          <Button
            key={tier}
            variant={planTier === tier ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => apply(value.trim(), tier)}
          >
            {tier}
          </Button>
        ))}
      </div>
    </div>
  );
}
