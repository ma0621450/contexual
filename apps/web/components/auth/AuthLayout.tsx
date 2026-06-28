import Link from 'next/link';
import type { ReactNode } from 'react';

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
    <div className="flex min-h-screen items-center justify-center bg-surface-page px-4 py-12">
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-tint text-lg font-semibold text-brand-primary">
            C
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 text-sm text-text-muted">{subtitle}</p>
          ) : null}
        </div>

        <div className="auth-card">{children}</div>

        {footer ? (
          <div className="mt-6 text-center text-sm text-text-muted">{footer}</div>
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
      className="font-medium text-brand-primary transition-colors hover:text-brand-primary-hover"
    >
      {children}
    </Link>
  );
}
