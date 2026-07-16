import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';

type AuthLayoutProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
};

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_40%_at_50%_0%,color-mix(in_oklab,var(--primary)_12%,transparent),transparent)]" />
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className={cn('relative w-full', wide ? 'max-w-2xl' : 'max-w-md')}>
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-card"
          >
            C
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? (
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-border bg-card p-8 shadow-card">
          {children}
        </div>

        {footer ? (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AuthLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="font-medium text-primary underline-offset-4 transition-colors hover:underline"
    >
      {children}
    </Link>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive"
    >
      {children}
    </p>
  );
}
