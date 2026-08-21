import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@contexual/ui';
import { BuildingIcon, ShieldCheckIcon } from 'lucide-react';
import { SignOutButton } from '@/components/SignOutButton';
import { requirePlatformAdmin } from '@/lib/api/server';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requirePlatformAdmin();

  if (admin.mustChangePassword) {
    redirect('/change-password');
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/organizations"
            className="flex items-center gap-2 font-semibold tracking-tight"
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheckIcon className="size-4" />
            </span>
            Platform Admin
          </Link>

          <nav className="ml-4 hidden items-center gap-1 sm:flex">
            <Link
              href="/organizations"
              className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <BuildingIcon className="size-4" />
              Organizations
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm leading-tight font-medium">{admin.name}</p>
              <p className="text-xs leading-tight text-muted-foreground">
                {admin.email}
              </p>
            </div>
            <Badge variant="outline">{admin.role}</Badge>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
