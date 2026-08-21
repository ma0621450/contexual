import { redirect } from 'next/navigation';
import {
  getConversations,
  getCurrentUser,
  getFiles,
  getProviderModels,
  getProviderStatus,
} from '@/lib/api/server';

export async function loadChatPageContext() {
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

  const [conversations, providerStatus, models, files] = await Promise.all([
    getConversations(),
    getProviderStatus(),
    getProviderModels(),
    getFiles(),
  ]);

  return {
    user,
    conversations,
    providerStatus,
    models,
    files,
  };
}
