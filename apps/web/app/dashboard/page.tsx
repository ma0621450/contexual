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
          Your workspace dashboard is ready. This is a placeholder while the
          rest of the product is built.
        </p>
      </div>
    </main>
  );
}
