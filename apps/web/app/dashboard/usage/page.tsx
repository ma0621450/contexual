import { redirect } from 'next/navigation';
import {
  getBillingStatus,
  getCurrentUser,
  getTeamOverview,
  getUsage,
} from '@/lib/api/server';
import { UsageClient } from './UsageClient';

type UsagePageProps = {
  searchParams: Promise<{ billing?: string }>;
};

export default async function UsagePage({ searchParams }: UsagePageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (!user.emailVerifiedAt) {
    redirect('/verify-email');
  }

  if (!user.activeOrganizationId || user.memberships.length === 0) {
    redirect('/onboarding');
  }

  if (user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const [usage, overview, billing] = await Promise.all([
    getUsage(),
    getTeamOverview(),
    getBillingStatus(),
  ]);

  return (
    <UsageClient
      usage={usage}
      overview={overview}
      billing={billing}
      currentUserId={user.id}
      billingNotice={
        params.billing === 'success'
          ? 'Payment received. Your plan will update shortly.'
          : params.billing === 'cancelled'
            ? 'Checkout was cancelled.'
            : null
      }
    />
  );
}
