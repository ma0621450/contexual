import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/api/server';

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (!user.emailVerifiedAt) {
    redirect('/verify-email');
  }

  if (user.memberships.length === 0) {
    redirect('/onboarding');
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <div className="auth-card">
        <p className="text-sm font-medium text-brand-primary">Contexual</p>
        <h1 className="mt-2 text-2xl font-semibold text-text-primary">
          Welcome, {user.name}
        </h1>
        <p className="mt-2 text-text-muted">
          Your team&apos;s AI workspace is ready.
        </p>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
          <Link
            href="/dashboard/chat"
            className="font-medium text-brand-primary transition-colors hover:text-brand-primary-hover"
          >
            Open chat
          </Link>
          <Link
            href="/dashboard/team"
            className="font-medium text-brand-primary transition-colors hover:text-brand-primary-hover"
          >
            Manage team
          </Link>
          <Link
            href="/dashboard/providers"
            className="font-medium text-brand-primary transition-colors hover:text-brand-primary-hover"
          >
            AI providers
          </Link>
          {user.role === 'ADMIN' ? (
            <>
              <Link
                href="/dashboard/usage"
                className="font-medium text-brand-primary transition-colors hover:text-brand-primary-hover"
              >
                Usage &amp; billing
              </Link>
              <Link
                href="/dashboard/audit"
                className="font-medium text-brand-primary transition-colors hover:text-brand-primary-hover"
              >
                Audit log
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
