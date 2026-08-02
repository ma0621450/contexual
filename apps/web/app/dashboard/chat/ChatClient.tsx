'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownIcon,
  CheckIcon,
  CopyIcon,
  FileIcon,
  FolderOpenIcon,
  HardDriveIcon,
  LoaderCircleIcon,
  MessagesSquareIcon,
  PaperclipIcon,
  PanelLeftIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  SparklesIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
  XIcon,
} from 'lucide-react';
import { streamChat, apiFetch } from '@/lib/api/client';
import type {
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  ProviderModel,
  StoredFile,
} from '@/lib/api/server';
import { waitForFileTerminal } from '@/lib/files';
import { cn } from '@/lib/utils';
import { Markdown } from '@/components/chat/Markdown';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PROVIDER_LABELS: Record<string, string> = {
  OPENAI: 'OpenAI',
  ANTHROPIC: 'Anthropic',
  GOOGLE: 'Google',
  XAI: 'xAI',
};

const SUGGESTIONS = [
  'Summarize the key points of my attached document',
  'Draft a project update email for stakeholders',
  'Explain this concept with a simple example',
  'Compare the options in a table with pros and cons',
];

const MAX_ATTACHMENTS = 5;

type ChatClientProps = {
  initialConversations: ConversationSummary[];
  providerConnected: boolean;
  connectedProviders: Array<{
    provider: 'OPENAI' | 'ANTHROPIC' | 'GOOGLE' | 'XAI';
    defaultModel: string;
    enabledModels: string[];
  }>;
  defaultModel: string | null;
  models: ProviderModel[];
  initialFiles: StoredFile[];
  isAdmin: boolean;
};

type ChatAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

type PendingUpload = {
  key: string;
  filename: string;
  stage: 'uploading' | 'processing';
};

let tempIdCounter = 0;

export function ChatClient({
  initialConversations,
  providerConnected,
  connectedProviders = [],
  defaultModel,
  models,
  initialFiles,
  isAdmin,
}: ChatClientProps) {
  const [conversations, setConversations] =
    useState<ConversationSummary[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const enabledModelIds = useMemo(() => {
    const ids = new Set<string>();
    for (const connection of connectedProviders ?? []) {
      for (const modelId of connection.enabledModels ?? []) {
        ids.add(modelId);
      }
    }
    return ids;
  }, [connectedProviders]);
  const availableModels = useMemo(
    () =>
      models.filter(
        (item) =>
          enabledModelIds.has(item.id) &&
          (connectedProviders ?? []).some(
            (connection) => connection.provider === item.provider,
          ),
      ),
    [models, enabledModelIds, connectedProviders],
  );
  const modelsByProvider = useMemo(() => {
    const groups = new Map<string, ProviderModel[]>();
    for (const model of availableModels) {
      const current = groups.get(model.provider) ?? [];
      current.push(model);
      groups.set(model.provider, current);
    }
    return [...groups.entries()];
  }, [availableModels]);
  const defaultNewChatModel =
    availableModels.find((item) => item.id === defaultModel)?.id ??
    availableModels.find((item) => item.isDefault)?.id ??
    availableModels[0]?.id ??
    '';
  const [model, setModel] = useState<string>(defaultNewChatModel);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [libraryFiles, setLibraryFiles] = useState(initialFiles);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [sending, setSending] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [error, setError] = useState('');
  const [failedMessage, setFailedMessage] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const uploading = pendingUploads.length > 0;
  const activeConversation = conversations.find((item) => item.id === activeId);
  const activeModelLabel =
    availableModels.find((item) => item.id === model)?.label ?? 'No model';
  const conversationFiles = useMemo(() => {
    const unique = new Map<string, ChatAttachment>();
    for (const message of messages) {
      for (const file of message.attachments ?? []) {
        unique.set(file.id, file);
      }
    }
    return [...unique.values()];
  }, [messages]);
  const readyLibraryFiles = useMemo(() => {
    const query = librarySearch.trim().toLowerCase();
    return libraryFiles.filter(
      (file) =>
        file.processingStatus === 'READY' &&
        (!query || file.filename.toLowerCase().includes(query)),
    );
  }, [libraryFiles, librarySearch]);

  useEffect(() => {
    if (!atBottom) return;
    const element = scrollRef.current;
    element?.scrollTo({ top: element.scrollHeight });
  }, [messages, atBottom]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  }, [input]);

  function handleScroll() {
    const element = scrollRef.current;
    if (!element) return;
    const distance =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    setAtBottom(distance < 120);
  }

  function scrollToBottom() {
    const element = scrollRef.current;
    element?.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    setAtBottom(true);
  }

  async function openConversation(id: string) {
    if (loadingConversation) return;
    setActiveId(id);
    setError('');
    setSidebarOpen(false);
    setAtBottom(true);
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
      if (availableModels.some((item) => item.id === result.data.model)) {
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
    setAttachments([]);
    setError('');
    setFailedMessage('');
    setSidebarOpen(false);
    setAtBottom(true);
    setModel(defaultNewChatModel);
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
    setAtBottom(true);
    let outgoingContent = content;
    let outgoingAttachments = [...attachments];

    if (content.length > 8000) {
      const pastedFile = await apiFetch<StoredFile>('/files/text', {
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
      const processedFile = await waitForFileTerminal(pastedFile.data);
      if (!processedFile.ok) {
        setError(
          processedFile.file?.failureMessage ??
            processedFile.error ??
            'The pasted text could not be processed.',
        );
        setSending(false);
        return;
      }
      if (processedFile.file.processingStatus !== 'READY') {
        setError(
          processedFile.file.failureMessage ??
            'The pasted text could not be processed.',
        );
        setSending(false);
        return;
      }
      outgoingAttachments = [
        ...outgoingAttachments,
        {
          id: processedFile.file.id,
          filename: processedFile.file.filename,
          mimeType: processedFile.file.mimeType,
          sizeBytes: processedFile.file.sizeBytes,
        },
      ];
      outgoingContent =
        'Please review and respond to the attached pasted text.';
    }

    const optimisticUser: ChatMessage = {
      id: `temp-user-${tempIdCounter++}`,
      role: 'USER',
      content: outgoingContent,
      createdAt: new Date().toISOString(),
      attachments: outgoingAttachments,
    };
    const streamingAssistantId = `temp-assistant-${tempIdCounter++}`;
    const streamingAssistant: ChatMessage = {
      id: streamingAssistantId,
      role: 'ASSISTANT',
      content: '',
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticUser, streamingAssistant]);
    setStreamingId(streamingAssistantId);
    setInput('');
    setAttachments([]);

    try {
      const result = await streamChat(
        {
          conversationId: activeId ?? undefined,
          content: outgoingContent,
          model: model || undefined,
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
                      model: model || '',
                      provider:
                        availableModels.find((item) => item.id === model)
                          ?.provider ??
                        connectedProviders[0]?.provider ??
                        'OPENAI',
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

            const nextModel = event.usage.model || model;
            const nextProvider =
              availableModels.find((item) => item.id === nextModel)?.provider ??
              connectedProviders[0]?.provider ??
              'OPENAI';

            setActiveId(event.conversationId);
            if (
              nextModel &&
              availableModels.some((item) => item.id === nextModel)
            ) {
              setModel(nextModel);
            }
            setConversations((prev) =>
              prev.map((item) =>
                item.id === event.conversationId
                  ? {
                      ...item,
                      title: event.title,
                      model: nextModel || item.model,
                      provider: nextProvider,
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
            (m) => m.id !== optimisticUser.id && m.id !== streamingAssistantId,
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
      setStreamingId(null);
    }
  }

  async function uploadFiles(files: File[]) {
    const availableSlots = Math.max(
      0,
      MAX_ATTACHMENTS - attachments.length - pendingUploads.length,
    );
    const selected = files.slice(0, availableSlots);
    if (selected.length === 0) {
      setError(`You can attach up to ${MAX_ATTACHMENTS} files to a message.`);
      return;
    }

    setError('');
    await Promise.all(
      selected.map(async (file) => {
        const key = `${file.name}-${file.size}-${file.lastModified}-${tempIdCounter++}`;
        setPendingUploads((current) => [
          ...current,
          { key, filename: file.name, stage: 'uploading' },
        ]);

        try {
          const form = new FormData();
          form.append('file', file);
          const result = await apiFetch<StoredFile>('/files/upload', {
            method: 'POST',
            body: form,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }

          setLibraryFiles((current) => [
            result.data,
            ...current.filter((item) => item.id !== result.data.id),
          ]);
          setPendingUploads((current) =>
            current.map((item) =>
              item.key === key ? { ...item, stage: 'processing' } : item,
            ),
          );
          const processed = await waitForFileTerminal(result.data);
          if (!processed.ok) {
            setError(
              processed.file?.failureMessage ??
                processed.error ??
                'The file could not be processed.',
            );
            return;
          }
          if (processed.file.processingStatus !== 'READY') {
            setError(
              processed.file.failureMessage ??
                'The file could not be processed.',
            );
            return;
          }

          setLibraryFiles((current) =>
            current.map((item) =>
              item.id === processed.file.id ? processed.file : item,
            ),
          );
          setAttachments((previous) =>
            [
              ...previous.filter((item) => item.id !== processed.file.id),
              {
                id: processed.file.id,
                filename: processed.file.filename,
                mimeType: processed.file.mimeType,
                sizeBytes: processed.file.sizeBytes,
              },
            ].slice(0, MAX_ATTACHMENTS),
          );
        } finally {
          setPendingUploads((current) =>
            current.filter((item) => item.key !== key),
          );
        }
      }),
    );
  }

  async function openLibrary() {
    setLibraryOpen(true);
    setLibraryLoading(true);
    setSelectedLibraryIds([]);
    const result = await apiFetch<StoredFile[]>('/files');
    if (result.ok) {
      setLibraryFiles(result.data);
    } else {
      setError(result.error);
    }
    setLibraryLoading(false);
  }

  function addLibraryFiles() {
    const selected = libraryFiles
      .filter((file) => selectedLibraryIds.includes(file.id))
      .map((file) => ({
        id: file.id,
        filename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      }));
    setAttachments((current) => {
      const unique = new Map(current.map((file) => [file.id, file]));
      for (const file of selected) unique.set(file.id, file);
      return [...unique.values()].slice(0, MAX_ATTACHMENTS);
    });
    setLibraryOpen(false);
    setLibrarySearch('');
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
    !uploading &&
    providerConnected &&
    model.length > 0 &&
    (input.trim().length > 0 || attachments.length > 0);
  const attachmentsFull =
    attachments.length + pendingUploads.length >= MAX_ATTACHMENTS;

  const conversationList = (
    <>
      <div className="p-3">
        <Button onClick={startNewChat} className="w-full justify-start gap-2">
          <PlusIcon className="size-4" />
          New chat
        </Button>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
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
                  : 'hover:bg-muted/70',
              )}
            >
              <button
                type="button"
                onClick={() => openConversation(conversation.id)}
                aria-label={conversation.title}
                className={cn(
                  'min-w-0 flex-1 rounded-lg px-3 py-2 text-left transition-colors',
                  activeId === conversation.id
                    ? 'text-accent-foreground'
                    : 'text-foreground',
                )}
              >
                <span
                  className={cn(
                    'block truncate text-sm',
                    activeId === conversation.id && 'font-medium',
                  )}
                >
                  {conversation.title}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {formatRelativeTime(conversation.updatedAt)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => archiveConversation(conversation.id)}
                disabled={archivingId === conversation.id}
                aria-label={`Archive ${conversation.title}`}
                title="Archive conversation"
                className="rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-background hover:text-destructive focus-visible:opacity-100 disabled:pointer-events-none group-hover:opacity-100"
              >
                <Trash2Icon className="size-3.5" />
              </button>
            </div>
          ))
        )}
      </nav>
    </>
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        {conversationList}
      </aside>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <button
            type="button"
            aria-label="Close conversation list"
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
          />
          <aside className="relative flex h-full w-72 max-w-[85%] flex-col border-r border-border bg-sidebar shadow-elevated">
            {conversationList}
          </aside>
        </div>
      ) : null}

      <section
        className={cn(
          'relative flex min-w-0 flex-1 flex-col transition-colors',
          dragActive && 'bg-primary/5',
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          if (event.dataTransfer.types.includes('Files')) setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setDragActive(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          void uploadFiles(Array.from(event.dataTransfer.files));
        }}
      >
        {dragActive ? (
          <div className="pointer-events-none absolute inset-4 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-background/90 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <UploadIcon className="size-6" />
              </span>
              <p className="font-medium">Drop files to add them to this chat</p>
              <p className="text-sm text-muted-foreground">
                PDF, DOCX, TXT, Markdown, CSV, or JSON
              </p>
            </div>
          </div>
        ) : null}

        <header className="flex items-center gap-2 border-b border-border bg-background/80 px-3 py-2.5 backdrop-blur-sm sm:px-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open conversation list"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelLeftIcon className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-medium">
              {activeConversation?.title ?? 'New chat'}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {activeModelLabel}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="New chat"
            onClick={startNewChat}
          >
            <PlusIcon className="size-4" />
          </Button>
        </header>

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

        {conversationFiles.length > 0 ? (
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
            <HardDriveIcon className="size-3.5 shrink-0" />
            <span className="shrink-0">
              {conversationFiles.length}{' '}
              {conversationFiles.length === 1 ? 'file is' : 'files are'} active
            </span>
            <span className="truncate text-foreground">
              {conversationFiles.map((file) => file.filename).join(', ')}
            </span>
          </div>
        ) : null}

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto scroll-smooth"
        >
          <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
            {loadingConversation && messages.length === 0 ? (
              <div className="space-y-6">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="flex gap-3">
                    <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5 text-center">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                  <MessagesSquareIcon className="size-7" />
                </span>
                <div>
                  <p className="text-lg font-semibold">
                    How can I help you today?
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ask a question, or attach a file to chat about it.
                  </p>
                </div>
                <div className="grid w-full max-w-xl gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        setInput(suggestion);
                        textareaRef.current?.focus();
                      }}
                      disabled={!providerConnected}
                      className="rounded-xl border border-border bg-card px-3.5 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-60"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((message) => (
                  <MessageRow
                    key={message.id}
                    message={message}
                    streaming={streamingId === message.id}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {!atBottom && messages.length > 0 ? (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Scroll to latest message"
            className="absolute bottom-36 left-1/2 z-20 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-elevated transition-colors hover:text-foreground"
          >
            <ArrowDownIcon className="size-4" />
          </button>
        ) : null}

        <div className="border-t border-border bg-background/80 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6 sm:py-4">
            {error ? (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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

            <form
              onSubmit={handleSend}
              className="rounded-2xl border border-border bg-card shadow-card transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-ring/20"
            >
              {attachments.length || pendingUploads.length ? (
                <div className="flex flex-wrap gap-2 border-b border-border p-3">
                  {attachments.map((file) => (
                    <div
                      key={file.id}
                      className="flex min-w-0 max-w-64 items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-2"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <FileIcon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">
                          {file.filename}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {formatFileSize(file.sizeBytes)} · Ready
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setAttachments((previous) =>
                            previous.filter((item) => item.id !== file.id),
                          )
                        }
                        className="rounded p-1 text-muted-foreground transition hover:bg-background hover:text-foreground"
                        title="Remove attachment"
                        aria-label={`Remove ${file.filename}`}
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  {pendingUploads.map((file) => (
                    <div
                      key={file.key}
                      className="flex min-w-0 max-w-64 items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-2"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <LoaderCircleIcon className="size-4 animate-spin" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">
                          {file.filename}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {file.stage === 'uploading'
                            ? 'Uploading…'
                            : 'Scanning and processing…'}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend(event);
                  }
                }}
                onPaste={(event) => {
                  const files = Array.from(event.clipboardData.files);
                  if (files.length > 0) {
                    event.preventDefault();
                    void uploadFiles(files);
                  }
                }}
                rows={1}
                placeholder="Message Contexual…"
                aria-label="Message"
                className="max-h-50 min-h-11 resize-none rounded-none border-0 bg-transparent px-4 py-3 shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
                disabled={sending || !providerConnected}
              />

              <div className="flex items-center gap-2 px-2.5 pb-2.5">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      disabled={sending || attachmentsFull}
                      title="Add files"
                      aria-label="Add files"
                    >
                      <PaperclipIcon className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top" className="w-52">
                    <DropdownMenuItem
                      onSelect={() => fileInputRef.current?.click()}
                    >
                      <UploadIcon />
                      Upload from device
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void openLibrary()}>
                      <FolderOpenIcon />
                      Choose from Files
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".txt,.md,.csv,.json,.pdf,.docx,text/plain,text/markdown,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  disabled={sending || attachmentsFull}
                  onChange={(event) => {
                    void uploadFiles(Array.from(event.target.files ?? []));
                    event.target.value = '';
                  }}
                  className="sr-only"
                />

                <Select
                  value={model}
                  onValueChange={setModel}
                  disabled={sending || availableModels.length === 0}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-36 shrink-0 border-0 bg-muted/60 shadow-none sm:w-48 dark:bg-muted/60"
                    aria-label="Chat model"
                  >
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelsByProvider.map(([providerId, providerModels]) => (
                      <SelectGroup key={providerId}>
                        <SelectLabel>
                          {PROVIDER_LABELS[providerId] ?? providerId}
                        </SelectLabel>
                        {providerModels.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.label}
                            {item.isDefault ? ' ★' : ''}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>

                <span className="ml-auto hidden text-[11px] text-muted-foreground sm:block">
                  Enter to send · Shift+Enter for a new line
                </span>

                <Button
                  type="submit"
                  size="icon"
                  className="shrink-0 rounded-full"
                  disabled={!canSend}
                  aria-label="Send message"
                >
                  {sending ? (
                    <LoaderCircleIcon className="size-4 animate-spin" />
                  ) : (
                    <SendIcon className="size-4" />
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </section>

      <Dialog
        open={libraryOpen}
        onOpenChange={(open) => {
          setLibraryOpen(open);
          if (!open) {
            setLibrarySearch('');
            setSelectedLibraryIds([]);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose files from your workspace</DialogTitle>
            <DialogDescription>
              Reuse processed files without uploading or scanning them again.
              Selected files remain available for follow-up questions in this
              conversation.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={librarySearch}
              onChange={(event) => setLibrarySearch(event.target.value)}
              placeholder="Search files…"
              className="pl-9"
            />
          </div>

          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {libraryLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <LoaderCircleIcon className="size-4 animate-spin" />
                Loading files…
              </div>
            ) : readyLibraryFiles.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <FolderOpenIcon className="size-8 text-muted-foreground" />
                <p className="text-sm font-medium">No ready files found</p>
                <p className="text-xs text-muted-foreground">
                  Upload a file here or from the Files tab first.
                </p>
              </div>
            ) : (
              readyLibraryFiles.map((file) => {
                const selected = selectedLibraryIds.includes(file.id);
                const alreadyAttached = attachments.some(
                  (attachment) => attachment.id === file.id,
                );
                const selectionFull =
                  attachments.length + selectedLibraryIds.length >=
                  MAX_ATTACHMENTS;
                return (
                  <button
                    key={file.id}
                    type="button"
                    disabled={alreadyAttached || (!selected && selectionFull)}
                    onClick={() =>
                      setSelectedLibraryIds((current) =>
                        current.includes(file.id)
                          ? current.filter((id) => id !== file.id)
                          : [...current, file.id],
                      )
                    }
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/60',
                      (alreadyAttached || (!selected && selectionFull)) &&
                        'cursor-not-allowed opacity-50',
                    )}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <FileIcon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {file.filename}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatFileSize(file.sizeBytes)}
                        {file.uploadedBy?.name
                          ? ` · Uploaded by ${file.uploadedBy.name}`
                          : ''}
                      </span>
                    </span>
                    {alreadyAttached ? (
                      <span className="text-xs text-muted-foreground">
                        Attached
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'flex size-5 items-center justify-center rounded border',
                          selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border',
                        )}
                      >
                        {selected ? <CheckIcon className="size-3.5" /> : null}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLibraryOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={addLibraryFiles}
              disabled={selectedLibraryIds.length === 0}
            >
              Add{' '}
              {selectedLibraryIds.length > 0
                ? `${selectedLibraryIds.length} ${
                    selectedLibraryIds.length === 1 ? 'file' : 'files'
                  }`
                : 'files'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MessageRow({
  message,
  streaming,
}: {
  message: ChatMessage;
  streaming: boolean;
}) {
  const isUser = message.role === 'USER';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] min-w-0 space-y-2 rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground sm:max-w-[75%]">
          <p className="text-[0.9375rem] leading-7 whitespace-pre-wrap">
            {message.content}
          </p>
          {message.attachments?.length ? (
            <div className="space-y-1 border-t border-primary-foreground/25 pt-2">
              {message.attachments.map((file) => (
                <a
                  key={file.id}
                  href={`/api/files/${file.id}/download`}
                  className="flex items-center gap-1.5 text-xs underline underline-offset-2"
                >
                  <FileIcon className="size-3.5 shrink-0" />
                  <span className="truncate">{file.filename}</span>
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const empty = message.content.length === 0;

  return (
    <div className="group/message flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary">
        <SparklesIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        {empty ? (
          <div className="flex h-8 items-center gap-1.5 text-muted-foreground">
            <span className="size-2 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
            <span className="size-2 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
            <span className="size-2 animate-bounce rounded-full bg-current" />
          </div>
        ) : (
          <>
            <Markdown content={message.content} />
            {streaming ? (
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground align-text-bottom" />
            ) : null}
          </>
        )}

        {message.attachments?.length ? (
          <div className="mt-3 space-y-1 border-t border-border pt-2">
            {message.attachments.map((file) => (
              <a
                key={file.id}
                href={`/api/files/${file.id}/download`}
                className="flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                <FileIcon className="size-3.5 shrink-0" />
                <span className="truncate">{file.filename}</span>
              </a>
            ))}
          </div>
        ) : null}

        {!empty && !streaming ? (
          <div className="mt-2 flex opacity-0 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100">
            <MessageCopyButton content={message.content} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MessageCopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={copied ? 'Response copied' : 'Copy response'}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-success" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '';

  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
