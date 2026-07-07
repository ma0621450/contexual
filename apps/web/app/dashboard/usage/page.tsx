import { redirect } from 'next/navigation';
import {
  getCurrentUser,
  getTeamOverview,
  getUsage,
} from '@/lib/api/server';
import { UsageClient } from './UsageClient';

export default async function UsagePage() {
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

  const [usage, overview] = await Promise.all([getUsage(), getTeamOverview()]);

  return (
    <UsageClient
      usage={usage}
      overview={overview}
      currentUserId={user.id}
    />
  );
}
