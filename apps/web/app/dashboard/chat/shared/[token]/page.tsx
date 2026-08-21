import { notFound } from 'next/navigation';
import { getSharedConversation } from '@/lib/api/server';
import { ChatClient } from '../../ChatClient';
import { loadChatPageContext } from '../../load-chat';

export default async function SharedChatPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { user, conversations, providerStatus, models, files } =
    await loadChatPageContext();
  const shared = await getSharedConversation(token);

  if (!shared) {
    notFound();
  }

  return (
    <ChatClient
      initialConversations={conversations}
      providerConnected={providerStatus?.connected ?? false}
      connectedProviders={providerStatus?.providers ?? []}
      defaultModel={providerStatus?.defaultModel ?? null}
      models={models}
      initialFiles={files}
      isAdmin={user.role === 'ADMIN'}
      initialConversationId={shared.id}
      initialDetail={shared}
      readOnly
    />
  );
}
