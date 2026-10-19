import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import {
  getConversations,
  getCurrentUser,
  getFiles,
  getMemories,
  getProviderStatus,
} from '@/lib/api/server';
import { OverviewSkeleton, OverviewView } from './OverviewView';

async function OverviewContent() {
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

  const [provider, conversations, files, memories] = await Promise.all([
    getProviderStatus(),
    getConversations(),
    getFiles(),
    getMemories(),
  ]);

  const firstName = user.name.trim().split(/\s+/)[0] || 'there';

  return (
    <OverviewView
      firstName={firstName}
      providerConnected={provider ? provider.connected : null}
      conversations={conversations}
      files={files}
      memories={memories}
    />
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <OverviewContent />
    </Suspense>
  );
}
