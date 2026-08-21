import { notFound } from 'next/navigation';
import { ChatClient } from '@/app/dashboard/chat/ChatClient';
import { getPublicConversation } from '@/lib/api/server';

export default async function PublicSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const shared = await getPublicConversation(token);

  if (!shared) {
    notFound();
  }

  return (
    <div className="bg-background text-foreground">
      <ChatClient
        initialConversations={[]}
        providerConnected={false}
        connectedProviders={[]}
        defaultModel={null}
        models={[]}
        initialFiles={[]}
        isAdmin={false}
        initialConversationId={shared.id}
        initialDetail={shared}
        readOnly
        publicView
      />
    </div>
  );
}
