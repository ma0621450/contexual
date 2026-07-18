'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CheckIcon,
  FileIcon,
  FolderOpenIcon,
  HardDriveIcon,
  LoaderCircleIcon,
  MessagesSquareIcon,
  PaperclipIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type ChatClientProps = {
  initialConversations: ConversationSummary[];
  providerConnected: boolean;
  provider: 'OPENAI' | 'ANTHROPIC' | 'GOOGLE' | 'XAI' | null;
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
  provider,
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
  const availableModels = models.filter((item) => item.provider === provider);
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
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [failedMessage, setFailedMessage] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploading = pendingUploads.length > 0;
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
    }
  }

  async function uploadFiles(files: File[]) {
    const availableSlots = Math.max(
      0,
      5 - attachments.length - pendingUploads.length,
    );
    const selected = files.slice(0, availableSlots);
    if (selected.length === 0) {
      setError('You can attach up to 5 files to a message.');
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
            ].slice(0, 5),
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
      return [...unique.values()].slice(0, 5);
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
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-destructive disabled:pointer-events-none"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <section
        className={cn(
          'relative flex flex-1 flex-col overflow-hidden rounded-xl border bg-card transition-colors',
          dragActive ? 'border-primary bg-primary/5' : 'border-border',
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
          <div className="pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/90 backdrop-blur-sm">
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
            <span>
              {conversationFiles.length}{' '}
              {conversationFiles.length === 1 ? 'file is' : 'files are'} active
              in this conversation
            </span>
            <span className="truncate text-foreground">
              {conversationFiles.map((file) => file.filename).join(', ')}
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

        {attachments.length || pendingUploads.length ? (
          <div className="flex flex-wrap gap-2 border-t border-border px-4 pt-3">
            {attachments.map((file) => (
              <div
                key={file.id}
                className="group flex min-w-0 max-w-64 items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-2"
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
              className="w-38 shrink-0"
              aria-label="Chat model"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={
                  sending ||
                  attachments.length + pendingUploads.length >= 5
                }
                title="Add files"
              >
                <PaperclipIcon />
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
            disabled={
              sending || attachments.length + pendingUploads.length >= 5
            }
            onChange={(event) => {
              void uploadFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
            className="sr-only"
          />

          <Textarea
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
            placeholder="Type a message…"
            className="max-h-40 min-h-9 flex-1"
            disabled={sending || !providerConnected}
          />
          <Button type="submit" size="icon" disabled={!canSend}>
            <SendIcon />
          </Button>
        </form>
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
                  attachments.length + selectedLibraryIds.length >= 5;
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

function formatFileSize(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
