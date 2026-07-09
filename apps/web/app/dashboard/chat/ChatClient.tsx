'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { streamChat, apiFetch } from '@/lib/api/client';
import type {
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
} from '@/lib/api/server';

type ChatClientProps = {
  initialConversations: ConversationSummary[];
  providerConnected: boolean;
  isAdmin: boolean;
};

let tempIdCounter = 0;

export function ChatClient({
  initialConversations,
  providerConnected,
  isAdmin,
}: ChatClientProps) {
  const [conversations, setConversations] =
    useState<ConversationSummary[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [error, setError] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function openConversation(id: string) {
    if (loadingConversation) return;
    setActiveId(id);
    setError('');
    setLoadingConversation(true);
    try {
      const result = await apiFetch<ConversationDetail>(
        `/chat/conversations/${id}`,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessages(result.data.messages);
    } catch {
      setError('Unable to load conversation.');
    } finally {
      setLoadingConversation(false);
    }
  }

  function startNewChat() {
    setActiveId(null);
    setMessages([]);
    setError('');
  }

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || sending) return;

    setError('');
    setSending(true);

    const optimisticUser: ChatMessage = {
      id: `temp-user-${tempIdCounter++}`,
      role: 'USER',
      content,
      createdAt: new Date().toISOString(),
    };
    const streamingAssistantId = `temp-assistant-${tempIdCounter++}`;
    const streamingAssistant: ChatMessage = {
      id: streamingAssistantId,
      role: 'ASSISTANT',
      content: '',
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticUser, streamingAssistant]);
    setInput('');

    try {
      const result = await streamChat(
        {
          conversationId: activeId ?? undefined,
          content,
        },
        (event) => {
          if (event.type === 'token') {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === streamingAssistantId
                  ? { ...message, content: message.content + event.content }
                  : message,
              ),
            );
          }

          if (event.type === 'done') {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === streamingAssistantId
                  ? event.message
                  : message,
              ),
            );

            if (!activeId) {
              setActiveId(event.conversationId);
              setConversations((prev) => [
                {
                  id: event.conversationId,
                  title: event.title,
                  model: '',
                  provider: 'OPENAI',
                  updatedAt: new Date().toISOString(),
                },
                ...prev,
              ]);
            }
          }
        },
      );

      if (!result.ok) {
        setError(result.error);
        setMessages((prev) =>
          prev.filter(
            (m) =>
              m.id !== optimisticUser.id && m.id !== streamingAssistantId,
          ),
        );
        setInput(content);
      }
    } catch {
      setError('Unable to send message. Check your connection.');
      setMessages((prev) =>
        prev.filter(
          (m) => m.id !== optimisticUser.id && m.id !== streamingAssistantId,
        ),
      );
      setInput(content);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto flex h-[calc(100vh-2rem)] max-w-6xl gap-4 px-4 py-4">
      <aside className="flex w-64 shrink-0 flex-col rounded-xl border border-border bg-surface-card p-3">
        <button type="button" onClick={startNewChat} className="btn-primary">
          New chat
        </button>
        <div className="mt-3 flex-1 space-y-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="px-2 py-4 text-sm text-text-muted">
              No conversations yet.
            </p>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => openConversation(conversation.id)}
                className={`w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  activeId === conversation.id
                    ? 'bg-brand-tint text-brand-primary'
                    : 'text-text-primary hover:bg-surface-page'
                }`}
              >
                {conversation.title}
              </button>
            ))
          )}
        </div>
        <Link
          href="/dashboard"
          className="mt-3 px-2 text-sm text-text-muted hover:text-text-primary"
        >
          Back to dashboard
        </Link>
      </aside>

      <section className="flex flex-1 flex-col rounded-xl border border-border bg-surface-card">
        {!providerConnected ? (
          <div className="border-b border-border bg-semantic-error/5 px-4 py-3 text-sm text-semantic-error">
            No AI provider connected.{' '}
            {isAdmin ? (
              <Link href="/dashboard/providers" className="underline">
                Connect one
              </Link>
            ) : (
              'Ask an admin to connect one.'
            )}{' '}
            before chatting.
          </div>
        ) : null}

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-6">
          {messages.length === 0 && !loadingConversation ? (
            <div className="flex h-full items-center justify-center text-center text-text-muted">
              <p>Start the conversation by typing a message below.</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === 'USER' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                    message.role === 'USER'
                      ? 'bg-brand-primary text-white'
                      : 'bg-surface-page text-text-primary'
                  }`}
                >
                  {message.content ||
                    (sending && message.role === 'ASSISTANT' ? '…' : '')}
                </div>
              </div>
            ))
          )}
        </div>

        {error ? (
          <p className="px-6 pb-2 text-sm text-semantic-error">{error}</p>
        ) : null}

        <form
          onSubmit={handleSend}
          className="flex gap-2 border-t border-border p-4"
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Type a message..."
            className="auth-input flex-1"
            disabled={sending || !providerConnected}
          />
          <button
            type="submit"
            className="btn-primary w-auto shrink-0 px-6"
            disabled={sending || !providerConnected || input.trim().length === 0}
          >
            Send
          </button>
        </form>
      </section>
    </main>
  );
}
