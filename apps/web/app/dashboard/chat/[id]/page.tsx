import { ChatClient } from '../ChatClient';
import { loadChatPageContext } from '../load-chat';

export default async function ChatConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, conversations, providerStatus, models, files } =
    await loadChatPageContext();

  return (
    <ChatClient
      initialConversations={conversations}
      providerConnected={providerStatus?.connected ?? false}
      connectedProviders={providerStatus?.providers ?? []}
      defaultModel={providerStatus?.defaultModel ?? null}
      models={models}
      initialFiles={files}
      isAdmin={user.role === 'ADMIN'}
      firstName={user.name?.trim().split(/\s+/)[0] || 'there'}
      initialConversationId={id}
    />
  );
}
