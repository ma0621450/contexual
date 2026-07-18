import { redirect } from 'next/navigation';
import {
  getBillingStatus,
  getCurrentUser,
  getMyUsage,
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

  const params = await searchParams;
  const isAdmin = user.role === 'ADMIN';
  const [myUsage, usage, overview, billing] = await Promise.all([
    getMyUsage(),
    isAdmin ? getUsage() : Promise.resolve(null),
    isAdmin ? getTeamOverview() : Promise.resolve(null),
    isAdmin ? getBillingStatus() : Promise.resolve(null),
  ]);

  return (
    <UsageClient
      isAdmin={isAdmin}
      myUsage={myUsage}
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
