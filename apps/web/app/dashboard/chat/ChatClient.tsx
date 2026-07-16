'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  MessagesSquareIcon,
  PaperclipIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import { streamChat, apiFetch } from '@/lib/api/client';
import type {
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
} from '@/lib/api/server';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type ChatClientProps = {
  initialConversations: ConversationSummary[];
  providerConnected: boolean;
  provider: 'OPENAI' | 'ANTHROPIC' | 'GOOGLE' | 'XAI' | null;
  isAdmin: boolean;
};

type ChatAttachment = {
  id: string;
  filename: string;
};

const CHAT_MODELS = {
  OPENAI: [
    ['gpt-4o-mini', 'GPT-4o mini'],
    ['gpt-4o', 'GPT-4o'],
    ['gpt-4.1', 'GPT-4.1'],
  ],
  ANTHROPIC: [
    ['claude-3-5-haiku-latest', 'Claude 3.5 Haiku'],
    ['claude-sonnet-4-20250514', 'Claude Sonnet 4'],
  ],
  GOOGLE: [
    ['gemini-2.0-flash', 'Gemini 2.0 Flash'],
    ['gemini-2.5-pro', 'Gemini 2.5 Pro'],
  ],
  XAI: [
    ['grok-3-mini', 'Grok 3 mini'],
    ['grok-3', 'Grok 3'],
  ],
} as const;

let tempIdCounter = 0;

export function ChatClient({
  initialConversations,
  providerConnected,
  provider,
  isAdmin,
}: ChatClientProps) {
  const [conversations, setConversations] =
    useState<ConversationSummary[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const availableModels = provider ? CHAT_MODELS[provider] : CHAT_MODELS.OPENAI;
  const [model, setModel] = useState<string>(
    availableModels[0]?.[0] ?? 'gpt-4o-mini',
  );
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [failedMessage, setFailedMessage] = useState('');

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
      if (availableModels.some(([id]) => id === result.data.model)) {
        setModel(result.data.model);
      }
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
    setFailedMessage('');
  }

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    const content =
      input.trim() ||
      (attachments.length ? 'Please review the attached file.' : '');
    await sendMessage(content);
  }

  async function sendMessage(content: string) {
    if (!content || sending) return;

    setError('');
    setFailedMessage('');
    setSending(true);
    let outgoingContent = content;
    let outgoingAttachments = [...attachments];

    if (content.length > 8000) {
      const pastedFile = await apiFetch<ChatAttachment>('/files/text', {
        method: 'POST',
        body: JSON.stringify({
          filename: `pasted-text-${Date.now()}.txt`,
          content,
        }),
      });
      if (!pastedFile.ok) {
        setError(pastedFile.error);
        setSending(false);
        return;
      }
      outgoingAttachments = [...outgoingAttachments, pastedFile.data];
      outgoingContent =
        'Please review and respond to the attached pasted text.';
    }

    const optimisticUser: ChatMessage = {
      id: `temp-user-${tempIdCounter++}`,
      role: 'USER',
      content: outgoingContent,
      createdAt: new Date().toISOString(),
      attachments: outgoingAttachments.map((file) => ({
        ...file,
        mimeType: 'text/plain',
        sizeBytes: 0,
      })),
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
    setAttachments([]);

    try {
      const result = await streamChat(
        {
          conversationId: activeId ?? undefined,
          content: outgoingContent,
          model,
          attachmentIds: outgoingAttachments.map((file) => file.id),
        },
        (event) => {
          if (event.type === 'start') {
            setActiveId(event.conversationId);
            setConversations((prev) =>
              prev.some((item) => item.id === event.conversationId)
                ? prev
                : [
                    {
                      id: event.conversationId,
                      title: event.title,
                      model: '',
                      provider: provider ?? 'OPENAI',
                      updatedAt: new Date().toISOString(),
                    },
                    ...prev,
                  ],
            );
          }

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
                message.id === streamingAssistantId ? event.message : message,
              ),
            );

            setActiveId(event.conversationId);
            setConversations((prev) =>
              prev.map((item) =>
                item.id === event.conversationId
                  ? {
                      ...item,
                      title: event.title,
                      updatedAt: new Date().toISOString(),
                    }
                  : item,
              ),
            );
          }
        },
      );

      if (!result.ok) {
        setError(result.error);
        setFailedMessage(outgoingContent);
        setAttachments(outgoingAttachments);
        setMessages((prev) =>
          prev.filter(
            (m) =>
              m.id !== optimisticUser.id && m.id !== streamingAssistantId,
          ),
        );
        setInput(outgoingContent);
      }
    } catch {
      setError('Unable to send message. Check your connection.');
      setFailedMessage(outgoingContent);
      setAttachments(outgoingAttachments);
      setMessages((prev) =>
        prev.filter(
          (m) => m.id !== optimisticUser.id && m.id !== streamingAssistantId,
        ),
      );
      setInput(outgoingContent);
    } finally {
      setSending(false);
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setError('');
    const form = new FormData();
    form.append('file', file);
    const result = await apiFetch<ChatAttachment>('/files/upload', {
      method: 'POST',
      body: form,
    });
    if (result.ok) {
      setAttachments((previous) => [...previous, result.data].slice(0, 5));
    } else {
      setError(result.error);
    }
    setUploading(false);
  }

  async function archiveConversation(id: string) {
    const conversation = conversations.find((item) => item.id === id);
    if (!conversation || !window.confirm(`Archive “${conversation.title}”?`)) {
      return;
    }

    setArchivingId(id);
    setError('');
    const result = await apiFetch<{ ok: true }>(`/chat/conversations/${id}`, {
      method: 'DELETE',
    }).catch(() => ({ ok: false as const, error: 'Unable to archive chat.' }));

    if (!result.ok) {
      setError(result.error);
      setArchivingId(null);
      return;
    }

    setConversations((prev) => prev.filter((item) => item.id !== id));
    if (activeId === id) {
      startNewChat();
    }
    setArchivingId(null);
  }

  const canSend =
    !sending &&
    providerConnected &&
    (input.trim().length > 0 || attachments.length > 0);

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-7xl gap-4 p-4">
      <aside className="hidden w-64 shrink-0 flex-col rounded-xl border border-border bg-card md:flex">
        <div className="p-3">
          <Button onClick={startNewChat} className="w-full">
            <PlusIcon />
            New chat
          </Button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {conversations.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              No conversations yet.
            </p>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  'group flex items-center gap-1 rounded-lg pr-1 transition-colors',
                  activeId === conversation.id
                    ? 'bg-accent'
                    : 'hover:bg-muted',
                )}
              >
                <button
                  type="button"
                  onClick={() => openConversation(conversation.id)}
                  className={cn(
                    'min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    activeId === conversation.id
                      ? 'font-medium text-accent-foreground'
                      : 'text-foreground',
                  )}
                >
                  {conversation.title}
                </button>
                <button
                  type="button"
                  onClick={() => archiveConversation(conversation.id)}
                  disabled={archivingId === conversation.id}
                  aria-label={`Archive ${conversation.title}`}
                  title="Archive conversation"
                  className="rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:text-destructive focus:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <section className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
        {!providerConnected ? (
          <div className="flex items-center gap-2 border-b border-border bg-warning/10 px-4 py-2.5 text-sm text-warning">
            <TriangleAlertIcon className="size-4 shrink-0" />
            <span>
              No AI provider connected.{' '}
              {isAdmin ? (
                <Link
                  href="/dashboard/providers"
                  className="font-medium underline underline-offset-2"
                >
                  Connect one
                </Link>
              ) : (
                'Ask an admin to connect one'
              )}{' '}
              before chatting.
            </span>
          </div>
        ) : null}

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-6">
          {messages.length === 0 && !loadingConversation ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                <MessagesSquareIcon className="size-6" />
              </span>
              <div>
                <p className="font-medium">Start a new conversation</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Type a message below to begin chatting.
                </p>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex',
                  message.role === 'USER' ? 'justify-end' : 'justify-start',
                )}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap',
                    message.role === 'USER'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground',
                  )}
                >
                  {message.content ||
                    (sending && message.role === 'ASSISTANT' ? (
                      <span className="inline-flex gap-1">
                        <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-current" />
                      </span>
                    ) : (
                      ''
                    ))}
                  {message.attachments?.length ? (
                    <div className="mt-2 space-y-1 border-t border-current/20 pt-2">
                      {message.attachments.map((file) => (
                        <a
                          key={file.id}
                          href={`/api/files/${file.id}/download`}
                          className="block text-xs underline"
                        >
                          {file.filename}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        {error ? (
          <div className="mx-6 mb-2 flex items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive">
            <p>{error}</p>
            {failedMessage ? (
              <button
                type="button"
                onClick={() => sendMessage(failedMessage)}
                disabled={sending}
                className="shrink-0 font-medium underline underline-offset-2"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        {attachments.length ? (
          <div className="flex flex-wrap gap-2 border-t border-border px-4 pt-3">
            {attachments.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() =>
                  setAttachments((previous) =>
                    previous.filter((item) => item.id !== file.id),
                  )
                }
                className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs text-accent-foreground transition-colors hover:bg-accent/70"
                title="Remove attachment"
              >
                <PaperclipIcon className="size-3" />
                {file.filename}
                <XIcon className="size-3" />
              </button>
            ))}
          </div>
        ) : null}

        <form
          onSubmit={handleSend}
          className="flex items-end gap-2 border-t border-border p-4"
        >
          <Select
            value={model}
            onValueChange={setModel}
            disabled={sending || activeId !== null}
          >
            <SelectTrigger
              size="sm"
              className="w-[9.5rem] shrink-0"
              aria-label="Chat model"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map(([id, label]) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="icon"
            asChild
            disabled={uploading || sending || attachments.length >= 5}
            title="Attach a file"
          >
            <label className="cursor-pointer">
              <PaperclipIcon
                className={cn(uploading && 'animate-pulse')}
              />
              <input
                type="file"
                accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json"
                disabled={uploading || sending || attachments.length >= 5}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadFile(file);
                  event.target.value = '';
                }}
                className="sr-only"
              />
            </label>
          </Button>

          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSend(event);
              }
            }}
            rows={1}
            placeholder="Type a message…"
            className="max-h-40 min-h-9 flex-1"
            disabled={sending || !providerConnected}
          />
          <Button type="submit" size="icon" disabled={!canSend}>
            <SendIcon />
          </Button>
        </form>
      </section>
    </div>
  );
}
