import { redirect } from 'next/navigation';
import {
  getConversations,
  getCurrentUser,
  getFiles,
  getProviderModels,
  getProviderStatus,
} from '@/lib/api/server';
import { ChatClient } from './ChatClient';

export default async function ChatPage() {
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

  return (
    <ChatClient
      initialConversations={conversations}
      providerConnected={providerStatus?.connected ?? false}
      connectedProviders={providerStatus?.providers ?? []}
      defaultModel={providerStatus?.defaultModel ?? null}
      models={models}
      initialFiles={files}
      isAdmin={user.role === 'ADMIN'}
    />
  );
}
