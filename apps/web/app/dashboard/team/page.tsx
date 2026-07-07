import { redirect } from 'next/navigation';
import {
  getCurrentUser,
  getTeamInvites,
  getTeamMembers,
  getTeamOverview,
} from '@/lib/api/server';
import { TeamClient } from './TeamClient';

export default async function TeamPage() {
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

  const isAdmin = user.role === 'ADMIN';

  const [members, overview, invites] = await Promise.all([
    getTeamMembers(),
    getTeamOverview(),
    isAdmin ? getTeamInvites() : Promise.resolve([]),
  ]);

  return (
    <TeamClient
      currentUserId={user.id}
      isAdmin={isAdmin}
      members={members}
      invites={invites}
      overview={overview}
    />
  );
}
