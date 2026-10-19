import { ChatClient } from './ChatClient';
import { loadChatPageContext } from './load-chat';

export default async function ChatPage() {
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
    />
  );
}
