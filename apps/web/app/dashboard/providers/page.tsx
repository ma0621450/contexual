import { redirect } from 'next/navigation';
import {
  getCurrentUser,
  getProviderModels,
  getProviderStatus,
} from '@/lib/api/server';
import { ProvidersClient } from './ProvidersClient';

export default async function ProvidersPage() {
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

  const [status, models] = await Promise.all([
    getProviderStatus(),
    getProviderModels(),
  ]);

  return (
    <ProvidersClient
      isAdmin={user.role === 'ADMIN'}
      status={status}
      models={models}
    />
  );
}
