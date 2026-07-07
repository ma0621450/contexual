import { redirect } from 'next/navigation';
import {
  getConversations,
  getCurrentUser,
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

  const [conversations, providerStatus] = await Promise.all([
    getConversations(),
    getProviderStatus(),
  ]);

  return (
    <ChatClient
      initialConversations={conversations}
      providerConnected={providerStatus?.connected ?? false}
      isAdmin={user.role === 'ADMIN'}
    />
  );
}
