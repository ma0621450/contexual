'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDownIcon,
  CheckIcon,
  DownloadIcon,
  FileIcon,
  FolderOpenIcon,
  FolderIcon,
  HardDriveIcon,
  LoaderCircleIcon,
  PaperclipIcon,
  PanelLeftIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  SquareIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
  XIcon,
  PinIcon,
  ShareIcon,
  ArchiveRestoreIcon,
  ChevronLeftIcon,
  SlidersHorizontalIcon,
  Link2OffIcon,
  MicIcon,
} from 'lucide-react';
import {
  streamChat,
  streamRegenerate,
  streamEditMessage,
  apiFetch,
  searchConversations,
  renameConversation,
  deleteMessage,
  setMessageFeedback,
  updateConversation,
  listChatFolders,
  createChatFolder,
  renameChatFolder,
  deleteChatFolder,
  restoreConversation,
  shareConversation,
  selectMessageBranch,
  unshareConversation,
  updateChatFolder,
  pickCompareWinner,
  mergeCompareResponses,
} from '@/lib/api/client';
import type {
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  ProviderModel,
  StoredFile,
} from '@/lib/api/server';
import { waitForFileTerminal } from '@/lib/files';
import { useVoice } from '@/lib/voice/use-voice';

const chatColumnClass =
  'mx-auto w-full min-w-0 max-w-[min(100%,90rem)] px-[clamp(1rem,3vw,2.5rem)] transition-[max-width,padding] duration-300 ease-out';
import { cn } from '@/lib/utils';
import { CanvasModal, CanvasSidePanel } from '@/components/chat/CanvasPanel';
import { MessageRow } from '@/components/chat/MessageRow';
import type { CanvasArtifact } from '@/components/chat/parseMessageContent';
import {
  walkToRoot,
  siblingsOf,
  latestDescendantId,
  withCompareSiblings,
  collectDescendantIds,
} from '@/components/chat/chat-tree';
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChatShareDialog } from '@/components/chat/ChatShareDialog';
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

function chatDayBucket(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Earlier';
  const startOf = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = startOf(new Date()) - startOf(date);
  if (diff <= 0) return 'Today';
  if (diff === 86_400_000) return 'Yesterday';
  return 'Earlier';
}

type MessageUsage = {
  promptTokens: number;
  completionTokens: number;
  estimatedCostCents: number;
  model: string;
};

const MAX_ATTACHMENTS = 5;

function createTempId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

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
  firstName?: string;
  initialConversationId?: string | null;
  initialDetail?: ConversationDetail | null;
  readOnly?: boolean;
  publicView?: boolean;
};

type ChatAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl?: string;
};

type PendingUpload = {
  key: string;
  filename: string;
  stage: 'uploading' | 'processing';
  previewUrl?: string;
};

function isImageAttachment(file: { mimeType?: string; filename?: string; previewUrl?: string }) {
  return (
    Boolean(file.previewUrl) ||
    Boolean(file.mimeType?.startsWith('image/')) ||
    /\.(png|jpe?g|gif|webp)$/i.test(file.filename ?? '')
  );
}

export function ChatClient({
  initialConversations,
  providerConnected,
  connectedProviders = [],
  defaultModel,
  models,
  initialFiles,
  isAdmin,
  firstName = 'there',
  initialConversationId = null,
  initialDetail = null,
  readOnly = false,
  publicView = false,
}: ChatClientProps) {
  const [conversations, setConversations] =
    useState<ConversationSummary[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const inputRef = useRef('');
  inputRef.current = input;
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
  const resolveProjectModel = (
    project?: {
      defaultModel?: string | null;
    } | null,
  ) => {
    if (
      project?.defaultModel &&
      availableModels.some((item) => item.id === project.defaultModel)
    ) {
      return project.defaultModel;
    }
    return defaultNewChatModel;
  };
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
  const [historyOpen, setHistoryOpen] = useState(
    !publicView && initialConversations.length > 0,
  );
  const [creatingProject, setCreatingProject] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [error, setError] = useState('');
  const [failedMessage, setFailedMessage] = useState('');
  const [activeCanvas, setActiveCanvas] = useState<CanvasArtifact | null>(null);
  const [messageUsage, setMessageUsage] = useState<Record<string, MessageUsage>>(
    {},
  );
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const [folders, setFolders] = useState<
    Array<{
      id: string;
      name: string;
      instructions?: string | null;
      defaultModel?: string | null;
      fileIds?: string[];
    }>
  >([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [renamingProject, setRenamingProject] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [compareModel, setCompareModel] = useState('');
  const [instructions, setInstructions] = useState('');
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [projectInstructions, setProjectInstructions] = useState('');
  const [projectDefaultModel, setProjectDefaultModel] = useState('');
  const [projectFileIds, setProjectFileIds] = useState<string[]>([]);
  const [activeLeafId, setActiveLeafId] = useState<string | null>(null);
  const [liveTools, setLiveTools] = useState<
    Array<{ title: string; status: string; detail?: string }>
  >([]);
  const [citations, setCitations] = useState<
    Array<{ id: string; title: string; url?: string; snippet?: string }>
  >([]);
  const [folderDraft, setFolderDraft] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareExpiry, setShareExpiry] = useState<'1h' | '24h' | '7d' | 'never'>(
    'never',
  );
  const voice = useVoice({
    getText: () => inputRef.current,
    setText: setInput,
    setError,
    enabled: providerConnected && !readOnly && !sending,
  });
  const router = useRouter();
  const skipUrlResetRef = useRef(
    Boolean(initialConversationId || initialDetail),
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sidebarSearchRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledUploads = useRef(new Set<string>());
  const uploading = pendingUploads.length > 0;
  const activeConversation = conversations.find((item) => item.id === activeId);
  const activeProject = folders.find((item) => item.id === activeProjectId);
  const conversationIsShared = Boolean(activeConversation?.isShared);
  const searching = Boolean(sidebarSearch.trim());
  const visibleConversations = useMemo(() => {
    if (searching) return conversations;
    if (activeProjectId) {
      return conversations.filter((item) => item.folderId === activeProjectId);
    }
    return conversations.filter((item) => !item.folderId);
  }, [conversations, activeProjectId, searching]);
  const visibleMessages = useMemo(
    () =>
      withCompareSiblings(messages, walkToRoot(messages, activeLeafId)),
    [messages, activeLeafId],
  );
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && abortRef.current) {
        event.preventDefault();
        abortRef.current.abort();
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        sidebarSearchRef.current?.focus();
      }
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        startNewChat();
      }
      if (event.shiftKey && event.key.toLowerCase() === 'e' && messages.length) {
        event.preventDefault();
        exportConversation();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [messages.length]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsLargeScreen(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const query = sidebarSearch.trim();
    const timer = window.setTimeout(async () => {
      const result = await searchConversations(query, showArchived);
      if (result.ok) {
        setConversations(result.data as ConversationSummary[]);
      }
    }, 280);
    return () => window.clearTimeout(timer);
  }, [sidebarSearch, showArchived]);

  useEffect(() => {
    void listChatFolders().then((result) => {
      if (result.ok) setFolders(result.data);
    });
  }, []);

  useEffect(() => {
    if (initialDetail) {
      setActiveId(initialDetail.id);
      setMessages(initialDetail.messages);
      setActiveLeafId(initialDetail.activeLeafId ?? null);
      setInstructions(initialDetail.instructions ?? '');
      setWebSearch(Boolean(initialDetail.webSearchEnabled));
      if (availableModels.some((item) => item.id === initialDetail.model)) {
        setModel(initialDetail.model);
      }
      setConversations((prev) =>
        prev.some((item) => item.id === initialDetail.id)
          ? prev
          : [
              {
                id: initialDetail.id,
                title: initialDetail.title,
                model: initialDetail.model,
                provider: initialDetail.provider,
                updatedAt: new Date().toISOString(),
                isShared: Boolean(initialDetail.isShared),
              },
              ...prev,
            ],
      );
      return;
    }
    if (initialConversationId) {
      void openConversation(initialConversationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once from the URL
  }, [initialConversationId, initialDetail]);

  useEffect(() => {
    if (readOnly) return;
    if (skipUrlResetRef.current && !activeId) return;
    if (activeId) skipUrlResetRef.current = false;
    const desired = activeId
      ? `/dashboard/chat/${activeId}`
      : '/dashboard/chat';
    if (window.location.pathname !== desired) {
      window.history.replaceState(window.history.state, '', desired);
    }
  }, [activeId, readOnly]);

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
    setActiveCanvas(null);
    setMessageUsage({});
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
      setActiveLeafId(result.data.activeLeafId ?? null);
      setInstructions(result.data.instructions ?? '');
      setWebSearch(Boolean(result.data.webSearchEnabled));
      setActiveProjectId(result.data.folderId ?? activeProjectId);
      setConversations((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                title: result.data.title,
                isShared: Boolean(result.data.isShared),
                folderId: result.data.folderId ?? item.folderId,
              }
            : item,
        ),
      );
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
    if (readOnly) {
      router.push('/dashboard/chat');
      return;
    }
    voice.stopListening();
    voice.cancelReply();
    abortRef.current?.abort();
    abortRef.current = null;
    setActiveId(null);
    setMessages([]);
    setActiveLeafId(null);
    setInstructions('');
    setLiveTools([]);
    setCitations([]);
    for (const item of attachments) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    setAttachments([]);
    setError('');
    setFailedMessage('');
    setSidebarOpen(false);
    setAtBottom(true);
    setActiveCanvas(null);
    setMessageUsage({});
    setModel(resolveProjectModel(activeProject));
  }

  async function pickCompare(messageId: string) {
    const result = await pickCompareWinner(messageId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (activeId) {
      await openConversation(activeId);
    }
  }

  async function mergeCompare(messageId: string) {
    const result = await mergeCompareResponses(messageId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (activeId) {
      await openConversation(activeId);
    }
  }

  function openProjectSettings() {
    if (!activeProject) return;
    setProjectInstructions(activeProject.instructions ?? '');
    setProjectDefaultModel(activeProject.defaultModel ?? '');
    setProjectFileIds(activeProject.fileIds ?? []);
    setProjectSettingsOpen(true);
  }

  function stopGeneration() {
    voice.cancelReply();
    abortRef.current?.abort();
  }

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    let content = input.trim();
    if (voice.listening) {
      const stopped = voice.stopListening();
      if (stopped.pendingTranscription) return;
      content = stopped.text.trim() || content;
    }
    content = content || (attachments.length ? 'Please review the attached file.' : '');
    await sendMessage(content);
  }

  async function sendMessage(content: string) {
    if (!content || sending) return;

    const speakReply = voice.armReply() && !compareModel;
    if (speakReply) voice.beginReply();
    else voice.cancelReply();

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
      id: createTempId('temp-user'),
      role: 'USER',
      content: outgoingContent,
      createdAt: new Date().toISOString(),
      parentId: activeLeafId,
      attachments: outgoingAttachments,
    };
    const streamingAssistantId = createTempId('temp-assistant');
    const streamingAssistant: ChatMessage = {
      id: streamingAssistantId,
      role: 'ASSISTANT',
      content: '',
      createdAt: new Date().toISOString(),
      parentId: optimisticUser.id,
      metadata: compareModel ? { compareSlot: 0 } : undefined,
    };

    setMessages((prev) => [...prev, optimisticUser, streamingAssistant]);
    setActiveLeafId(streamingAssistantId);
    setStreamingId(streamingAssistantId);
    setInput('');
    setAttachments([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await streamChat(
        {
          conversationId: activeId ?? undefined,
          content: outgoingContent,
          model: model || undefined,
          attachmentIds: outgoingAttachments.map((file) => file.id),
          webSearch:
            webSearch || Boolean(activeConversation?.webSearchEnabled),
          compareModel: compareModel || undefined,
          parentMessageId:
            activeLeafId && !activeLeafId.startsWith('temp-')
              ? activeLeafId
              : undefined,
          folderId: !activeId ? activeProjectId ?? undefined : undefined,
        },
        (event) => {
          if (event.type === 'start') {
            setActiveId(event.conversationId);
            if (webSearch) {
              void updateConversation(event.conversationId, {
                webSearchEnabled: true,
              });
            }
            setLiveTools([]);
            setCitations([]);
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
                      folderId: activeProjectId,
                    },
                    ...prev,
                  ],
            );
          }

          if (event.type === 'tool') {
            setLiveTools((prev) => {
              const next = prev.filter((item) => item.title !== event.title);
              next.push({
                title: event.title,
                status: event.status,
                detail: event.detail,
              });
              return next;
            });
          }

          if (event.type === 'citation') {
            setCitations((prev) =>
              prev.some((item) => item.id === event.id) ? prev : [...prev, event],
            );
          }

          if (event.type === 'title') {
            setConversations((prev) =>
              prev.map((item) =>
                item.id === event.conversationId
                  ? { ...item, title: event.title }
                  : item,
              ),
            );
          }

          if (event.type === 'compare-start') {
            const compareId = createTempId('temp-compare');
            setStreamingId(compareId);
            setMessages((prev) => [
              ...prev,
              {
                id: compareId,
                role: 'ASSISTANT',
                content: '',
                createdAt: new Date().toISOString(),
                parentId: optimisticUser.id,
                metadata: { compareSlot: 1 },
              },
            ]);
          }

          if (event.type === 'token') {
            if (speakReply) voice.pushReply(event.content);
            setMessages((prev) => {
              const targetId =
                prev.find((item) => item.id.startsWith('temp-compare'))?.id ??
                streamingAssistantId;
              return prev.map((message) =>
                message.id === targetId
                  ? { ...message, content: message.content + event.content }
                  : message,
              );
            });
          }

          if (event.type === 'done') {
            if (speakReply && event.message.metadata?.compareSlot !== 1) {
              voice.finishReply();
            }
            setActiveLeafId(event.message.id);
            setMessages((prev) =>
              prev.map((message) => {
                if (event.message.metadata?.compareSlot === 1) {
                  return message.id.startsWith('temp-compare')
                    ? { ...event.message, parentId: message.parentId }
                    : message;
                }
                return message.id === streamingAssistantId
                  ? { ...event.message, parentId: optimisticUser.id }
                  : message;
              }),
            );
            setMessageUsage((prev) => ({
              ...prev,
              [event.message.id]: event.usage,
            }));

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
        { signal: controller.signal },
      );

      if (!result.ok) {
        voice.cancelReply();
        if (result.aborted) {
          setMessages((prev) => {
            const assistant = prev.find((m) => m.id === streamingAssistantId);
            if (assistant && assistant.content.trim().length > 0) {
              return prev.map((message) =>
                message.id === streamingAssistantId
                  ? {
                      ...message,
                      content: `${message.content}\n\n_Generation stopped._`,
                    }
                  : message,
              );
            }
            return prev.filter(
              (m) =>
                m.id !== optimisticUser.id && m.id !== streamingAssistantId,
            );
          });
        } else {
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
      } else {
        for (const item of outgoingAttachments) {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        }
      }
    } catch {
      voice.cancelReply();
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
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setSending(false);
      setStreamingId(null);
    }
  }

  async function regenerateAssistant(messageId: string) {
    if (sending || !activeId) return;
    const target = messages.find((message) => message.id === messageId);
    if (!target || target.role !== 'ASSISTANT') return;

    setError('');
    setSending(true);
    setAtBottom(true);

    const streamingAssistantId = createTempId('temp-assistant');
    setMessages((prev) => [
      ...prev,
      {
        id: streamingAssistantId,
        role: 'ASSISTANT',
        content: '',
        createdAt: new Date().toISOString(),
        parentId: target.parentId,
      },
    ]);
    setActiveLeafId(streamingAssistantId);
    setStreamingId(streamingAssistantId);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await streamRegenerate(
        {
          conversationId: activeId,
          assistantMessageId: messageId,
          model: model || undefined,
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
            setActiveLeafId(event.message.id);
            setMessages((prev) =>
              prev.map((message) =>
                message.id === streamingAssistantId
                  ? { ...event.message, parentId: target.parentId }
                  : message,
              ),
            );
            setMessageUsage((prev) => ({
              ...prev,
              [event.message.id]: event.usage,
            }));

            const nextModel = event.usage.model || model;
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
                      updatedAt: new Date().toISOString(),
                    }
                  : item,
              ),
            );
          }
        },
        { signal: controller.signal },
      );

      if (!result.ok && !result.aborted) {
        setError(result.error);
      }
    } catch {
      setError('Unable to regenerate the response.');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setSending(false);
      setStreamingId(null);
    }
  }

  function exportConversation() {
    if (messages.length === 0) return;
    const title = activeConversation?.title ?? 'chat';
    const body = visibleMessages
      .map((message) => {
        const label =
          message.role === 'USER'
            ? 'You'
            : message.role === 'ASSISTANT'
              ? 'Assistant'
              : 'System';
        return `## ${label}\n\n${message.content.trim()}\n`;
      })
      .join('\n');
    const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/[^\w.-]+/g, '-').toLowerCase() || 'chat'}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function saveConversationRename(id: string) {
    const title = renameDraft.trim();
    if (!title) {
      setRenamingId(null);
      return;
    }
    const result = await renameConversation(id, title);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConversations((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, title: result.data.title } : item,
      ),
    );
    setRenamingId(null);
  }

  async function deleteChatMessage(messageId: string) {
    if (sending) return;
    const index = messages.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    if (
      !window.confirm(
        'Delete this message and all replies after it? This cannot be undone.',
      )
    ) {
      return;
    }

    setError('');
    const result = await deleteMessage(messageId);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    const ids = new Set(collectDescendantIds(messages, messageId));
    setMessages((prev) => prev.filter((message) => !ids.has(message.id)));
    setMessageUsage((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        delete next[id];
      }
      return next;
    });
    if (activeLeafId && ids.has(activeLeafId)) {
      const remaining = messages.filter((message) => !ids.has(message.id));
      setActiveLeafId(remaining.at(-1)?.id ?? null);
    }
    if (activeCanvas) setActiveCanvas(null);
  }

  async function setFeedback(
    messageId: string,
    rating: 'up' | 'down' | 'none',
  ) {
    const result = await setMessageFeedback(messageId, rating);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? {
              ...message,
              metadata: {
                ...message.metadata,
                feedback: result.data.feedback ?? undefined,
              },
            }
          : message,
      ),
    );
  }

  async function editUserMessage(messageId: string, content: string) {
    if (sending || !activeId) return;
    const target = messages.find((message) => message.id === messageId);
    if (!target || target.role !== 'USER') return;

    setError('');
    setSending(true);
    setAtBottom(true);

    const optimisticUser: ChatMessage = {
      id: createTempId('temp-user'),
      role: 'USER',
      content,
      createdAt: new Date().toISOString(),
      parentId: target.parentId,
    };
    const streamingAssistantId = createTempId('temp-assistant');
    const streamingAssistant: ChatMessage = {
      id: streamingAssistantId,
      role: 'ASSISTANT',
      content: '',
      createdAt: new Date().toISOString(),
      parentId: optimisticUser.id,
    };
    setMessages((prev) => [...prev, optimisticUser, streamingAssistant]);
    setActiveLeafId(streamingAssistantId);
    setStreamingId(streamingAssistantId);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await streamEditMessage(
        messageId,
        { content, model: model || undefined },
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
            setActiveLeafId(event.message.id);
            setMessages((prev) =>
              prev.map((message) =>
                message.id === streamingAssistantId
                  ? { ...event.message, parentId: optimisticUser.id }
                  : message,
              ),
            );
            setMessageUsage((prev) => ({
              ...prev,
              [event.message.id]: event.usage,
            }));
            const nextModel = event.usage.model || model;
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
                      updatedAt: new Date().toISOString(),
                    }
                  : item,
              ),
            );
          }
        },
        { signal: controller.signal },
      );

      if (!result.ok && !result.aborted) {
        setError(result.error);
      }
    } catch {
      setError('Unable to edit the message.');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
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
        const key = createTempId(`upload-${file.name}-${file.size}`);
        const previewUrl = file.type.startsWith('image/')
          ? URL.createObjectURL(file)
          : undefined;
        setPendingUploads((current) => [
          ...current,
          { key, filename: file.name, stage: 'uploading', previewUrl },
        ]);

        try {
          const form = new FormData();
          form.append('file', file);
          const result = await apiFetch<StoredFile>('/files/upload', {
            method: 'POST',
            body: form,
          });
          if (!result.ok) {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
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
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setError(
              processed.file?.failureMessage ??
                processed.error ??
                'The file could not be processed.',
            );
            return;
          }
          if (processed.file.processingStatus !== 'READY') {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setError(
              processed.file.failureMessage ??
                'The file could not be processed.',
            );
            return;
          }

          if (cancelledUploads.current.has(key)) {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
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
                previewUrl,
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

  function renderMessageRow(message: ChatMessage, index: number) {
    const sibs = siblingsOf(messages, message);
    return (
      <MessageRow
        message={message}
        streaming={streamingId === message.id}
        usage={messageUsage[message.id]}
        isLastAssistant={
          message.role === 'ASSISTANT' &&
          visibleMessages
            .slice(index + 1)
            .every((item) => item.role !== 'ASSISTANT')
        }
        sending={sending}
        onOpenCanvas={setActiveCanvas}
        onContinueClarifying={
          !sending && !readOnly
            ? (text) => {
                void sendMessage(text);
              }
            : undefined
        }
        onRegenerate={
          !readOnly &&
          !sending &&
          activeId &&
          !message.id.startsWith('temp-')
            ? () => void regenerateAssistant(message.id)
            : undefined
        }
        onEdit={
          !readOnly &&
          message.role === 'USER' &&
          !sending &&
          activeId &&
          !message.id.startsWith('temp-')
            ? (content) => void editUserMessage(message.id, content)
            : undefined
        }
        onDelete={
          !readOnly &&
          !sending &&
          activeId &&
          !message.id.startsWith('temp-')
            ? () => void deleteChatMessage(message.id)
            : undefined
        }
        onFeedback={
          !readOnly &&
          message.role === 'ASSISTANT' &&
          !sending &&
          activeId &&
          !message.id.startsWith('temp-')
            ? (rating) => void setFeedback(message.id, rating)
            : undefined
        }
        branchIndex={sibs.findIndex((item) => item.id === message.id) + 1}
        branchCount={sibs.length}
        onBranch={
          sibs.length > 1
            ? (direction) => void switchBranch(message, direction)
            : undefined
        }
      />
    );
  }

  async function moveConversation(id: string, folderId: string | null) {
    const result = await updateConversation(id, { folderId });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConversations((prev) =>
      prev.map((item) => (item.id === id ? { ...item, folderId } : item)),
    );
  }

  function enterProject(id: string, name?: string) {
    setActiveProjectId(id);
    setRenamingProject(false);
    setRenameDraft(
      name ?? folders.find((item) => item.id === id)?.name ?? '',
    );
    setSidebarSearch('');
    const project = folders.find((item) => item.id === id);
    if (!activeId) {
      setModel(resolveProjectModel(project));
    }
  }

  function leaveProject() {
    setActiveProjectId(null);
    setRenamingProject(false);
  }

  async function switchBranch(message: ChatMessage, direction: -1 | 1) {
    const sibs = siblingsOf(messages, message);
    const index = sibs.findIndex((item) => item.id === message.id);
    const next = sibs[index + direction];
    if (!next) return;
    const leaf = latestDescendantId(messages, next.id);
    setActiveLeafId(leaf);
    if (!next.id.startsWith('temp-')) {
      await selectMessageBranch(next.id);
    }
  }

  function conversationRow(conversation: ConversationSummary) {
    const projectName = folders.find(
      (item) => item.id === conversation.folderId,
    )?.name;

    return (
      <div
        key={conversation.id}
        className={cn(
          'group flex items-center gap-1 rounded-lg pr-1 transition-colors',
        )}
      >
        {renamingId === conversation.id ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1"
            onSubmit={(event) => {
              event.preventDefault();
              void saveConversationRename(conversation.id);
            }}
          >
            <Input
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              className="h-8 text-xs"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setRenamingId(null);
                }
              }}
            />
            <Button type="submit" size="icon" className="size-8 shrink-0">
              <CheckIcon className="size-3.5" />
            </Button>
          </form>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                if (readOnly) {
                  router.push(`/dashboard/chat/${conversation.id}`);
                  return;
                }
                void openConversation(conversation.id);
              }}
              aria-label={conversation.title}
              title={
                searching && projectName
                  ? `${projectName} · ${formatRelativeTime(conversation.updatedAt)}`
                  : formatRelativeTime(conversation.updatedAt)
              }
              className={cn(
                'min-w-0 flex-1 rounded-lg px-3 py-1.5 text-left text-[13px] leading-5 transition-colors',
                activeId === conversation.id
                  ? 'bg-white/10 font-medium text-white'
                  : 'text-[#a1a1aa] hover:bg-white/[0.04] hover:text-white',
              )}
            >
              <span className="block truncate">
                {conversation.pinnedAt ? 'Pinned · ' : ''}
                {conversation.title}
              </span>
            </button>
            {folders.length ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Move ${conversation.title} to a project`}
                    title="Move to project"
                    className="rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-background hover:text-foreground group-hover:opacity-100"
                  >
                    <FolderIcon className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem
                    onSelect={() => void moveConversation(conversation.id, null)}
                  >
                    No project
                  </DropdownMenuItem>
                  {folders.map((folder) => (
                    <DropdownMenuItem
                      key={folder.id}
                      onSelect={() =>
                        void moveConversation(conversation.id, folder.id)
                      }
                    >
                      {folder.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setRenamingId(conversation.id);
                setRenameDraft(conversation.title);
              }}
              aria-label={`Rename ${conversation.title}`}
              title="Rename"
              className="rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-background hover:text-foreground focus-visible:opacity-100 disabled:pointer-events-none group-hover:opacity-100"
            >
              <PencilIcon className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                void updateConversation(conversation.id, {
                  pinned: !conversation.pinnedAt,
                }).then((result) => {
                  if (result.ok) {
                    setConversations((prev) =>
                      prev.map((item) =>
                        item.id === conversation.id
                          ? { ...item, pinnedAt: result.data.pinnedAt }
                          : item,
                      ),
                    );
                  }
                });
              }}
              aria-label="Pin conversation"
              title="Pin"
              className={cn(
                'rounded-md p-1.5 opacity-0 transition hover:bg-background hover:text-foreground group-hover:opacity-100',
                conversation.pinnedAt
                  ? 'text-primary opacity-100'
                  : 'text-muted-foreground',
              )}
            >
              <PinIcon className="size-3.5" />
            </button>
            {showArchived ? (
              <button
                type="button"
                onClick={() => {
                  void restoreConversation(conversation.id).then((result) => {
                    if (result.ok) {
                      setConversations((prev) =>
                        prev.filter((item) => item.id !== conversation.id),
                      );
                    }
                  });
                }}
                aria-label="Restore conversation"
                title="Restore"
                className="rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-background hover:text-foreground group-hover:opacity-100"
              >
                <ArchiveRestoreIcon className="size-3.5" />
              </button>
            ) : (
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
            )}
          </>
        )}
      </div>
    );
  }

  function toggleHistory() {
    if (window.matchMedia('(min-width: 768px)').matches) {
      setHistoryOpen((open) => !open);
    } else {
      setSidebarOpen((open) => !open);
    }
  }

  const historyCluster = (label: string) => (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={startNewChat}
        className="flex h-10 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm whitespace-nowrap text-white transition hover:bg-white/[0.06]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <PlusIcon className="size-4 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <kbd className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/15 px-1.5 py-0.5 text-[11px] text-[#a1a1aa]">
          ⌘ N
        </kbd>
      </button>
      <button
        type="button"
        aria-label={
          historyOpen || sidebarOpen
            ? 'Hide conversation list'
            : 'Show conversation list'
        }
        aria-pressed={historyOpen || sidebarOpen}
        onClick={toggleHistory}
        className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white transition hover:bg-white/[0.06]"
      >
        <PanelLeftIcon className="size-4" />
      </button>
    </div>
  );

  const conversationList = (
    <>
      <div className="space-y-2 p-3">
        {activeProject ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Back to all chats"
              onClick={leaveProject}
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            {renamingProject ? (
              <form
                className="flex min-w-0 flex-1 items-center gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = renameDraft.trim();
                  if (!name || !activeProjectId) {
                    setRenamingProject(false);
                    return;
                  }
                  void renameChatFolder(activeProjectId, name).then((result) => {
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setFolders((prev) =>
                      prev.map((item) =>
                        item.id === activeProjectId
                          ? { ...item, name: result.data.name }
                          : item,
                      ),
                    );
                    setRenamingProject(false);
                  });
                }}
              >
                <Input
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  className="h-8 text-xs"
                  autoFocus
                  aria-label="Project name"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setRenamingProject(false);
                  }}
                />
              </form>
            ) : (
              <button
                type="button"
                className="min-w-0 flex-1 truncate px-1 text-left text-sm font-medium"
                onClick={() => {
                  setRenameDraft(activeProject.name);
                  setRenamingProject(true);
                }}
                title="Rename project"
              >
                {activeProject.name}
              </button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Project settings"
              title="Project settings"
              onClick={openProjectSettings}
            >
              <SlidersHorizontalIcon className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label="Delete project"
              title="Delete project"
              onClick={() => {
                if (!activeProjectId) return;
                if (
                  !window.confirm(
                    'Delete this project? Its chats will return to your main list.',
                  )
                ) {
                  return;
                }
                void deleteChatFolder(activeProjectId).then((result) => {
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  const removedId = activeProjectId;
                  setFolders((prev) =>
                    prev.filter((item) => item.id !== removedId),
                  );
                  setConversations((prev) =>
                    prev.map((item) =>
                      item.folderId === removedId
                        ? { ...item, folderId: null }
                        : item,
                    ),
                  );
                  leaveProject();
                });
              }}
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          </div>
        ) : null}
        {historyCluster(activeProject ? 'New chat in project' : 'New Chat')}
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[#737373]" />
          <Input
            ref={sidebarSearchRef}
            value={sidebarSearch}
            onChange={(event) => setSidebarSearch(event.target.value)}
            placeholder="Search anything..."
            aria-label="Search conversations"
            className="h-9 rounded-xl border-white/10 bg-transparent pr-10 pl-8 text-xs"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-[#737373]">
            ⌘K
          </kbd>
        </div>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-3">
        {!activeProject && !searching ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2">
              <p className="text-[11px] font-medium tracking-[0.08em] text-[#737373] uppercase">
                Projects
              </p>
              <button
                type="button"
                aria-label="New project"
                className="rounded-md p-1 text-[#737373] hover:bg-white/10 hover:text-white"
                onClick={() => setCreatingProject(true)}
              >
                <PlusIcon className="size-3.5" />
              </button>
            </div>
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => enterProject(folder.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm',
                  activeProjectId === folder.id
                    ? 'bg-white/10 text-white'
                    : 'text-[#d4d4d4] hover:bg-white/[0.04]',
                )}
              >
                <FolderIcon className="size-4 shrink-0 text-[#a1a1aa]" />
                <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              </button>
            ))}
            {creatingProject ? (
              <form
                className="flex gap-1 px-1 pt-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = folderDraft.trim();
                  if (!name) return;
                  void createChatFolder(name).then((result) => {
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setFolders((prev) =>
                      [...prev, result.data].sort((left, right) =>
                        left.name.localeCompare(right.name),
                      ),
                    );
                    setFolderDraft('');
                    setCreatingProject(false);
                    enterProject(result.data.id, result.data.name);
                  });
                }}
              >
                <Input
                  value={folderDraft}
                  onChange={(event) => setFolderDraft(event.target.value)}
                  placeholder="New project"
                  aria-label="New project name"
                  className="h-8 text-xs"
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setCreatingProject(false);
                  }}
                />
                <Button type="submit" size="icon" className="size-8 shrink-0">
                  <PlusIcon className="size-3.5" />
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}
        {visibleConversations.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-[#737373]">
            {searching
              ? 'No matching chats.'
              : activeProject
                ? 'No chats in this project yet.'
                : 'No conversations yet.'}
          </p>
        ) : searching ? (
          <div className="space-y-0.5">
            {visibleConversations.map((conversation) =>
              conversationRow(conversation),
            )}
          </div>
        ) : (
          <>
            {visibleConversations.some((item) => item.pinnedAt) ? (
              <div className="space-y-0.5">
                <p className="px-2 text-[11px] font-medium tracking-[0.08em] text-[#737373] uppercase">
                  Pinned
                </p>
                {visibleConversations
                  .filter((item) => item.pinnedAt)
                  .map((conversation) => conversationRow(conversation))}
              </div>
            ) : null}
            {(['Today', 'Yesterday', 'Earlier'] as const).map((label) => {
              const items = visibleConversations.filter(
                (item) =>
                  !item.pinnedAt && chatDayBucket(item.updatedAt) === label,
              );
              if (!items.length) return null;
              return (
                <div key={label} className="space-y-0.5">
                  <p className="px-2 text-[11px] font-medium tracking-[0.08em] text-[#737373] uppercase">
                    {label}
                  </p>
                  {items.map((conversation) => conversationRow(conversation))}
                </div>
              );
            })}
          </>
        )}
        <button
          type="button"
          onClick={() => setShowArchived((value) => !value)}
          className="px-2 text-left text-[11px] text-[#737373] hover:text-white"
        >
          {showArchived ? 'Show active chats' : 'Archived'}
        </button>
      </nav>
    </>
  );

  return (
    <div
      className={cn(
        'flex w-full overflow-hidden',
        publicView ? 'h-screen' : 'h-full',
      )}
    >
      {!publicView ? (
        <aside
          className={cn(
            'hidden shrink-0 overflow-hidden transition-[width,padding] duration-300 ease-out md:flex',
            historyOpen ? 'w-[292px] p-3' : 'w-0 p-0',
          )}
          aria-hidden={!historyOpen}
        >
          <div className="flex h-full min-h-0 w-[268px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
            {conversationList}
          </div>
        </aside>
      ) : null}

      {!publicView && sidebarOpen ? (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <button
            type="button"
            aria-label="Close conversation list"
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
          />
          <aside className="relative flex h-full w-72 max-w-[85%] flex-col border-r border-white/10 bg-[#111111] shadow-elevated">
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
        {messages.length === 0 && !readOnly ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[460px] overflow-hidden">
            <div className="absolute top-[-120px] left-1/2 h-[320px] w-[78%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.18),transparent_68%)]" />
            <img
              src="/brand/stars-workspace.svg"
              alt=""
              className="absolute inset-x-0 top-0 h-[280px] w-full object-cover opacity-70"
            />
          </div>
        ) : null}

        {dragActive ? (
          <div className="pointer-events-none absolute inset-4 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-background/90 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <UploadIcon className="size-6" />
              </span>
              <p className="font-medium">Drop files to add them to this chat</p>
              <p className="text-sm text-muted-foreground">
                PNG, JPEG, GIF, WEBP, PDF, DOCX, TXT, Markdown, CSV, or JSON
              </p>
            </div>
          </div>
        ) : null}

        <header className="flex items-center justify-between gap-2 px-3 py-3 sm:px-4">
          <h1 className="sr-only">
            {activeConversation?.title ?? 'New chat'}
          </h1>
          <div className={cn(historyOpen && 'md:hidden')}>
            {historyCluster('New Chat')}
          </div>
          <div className="ml-auto flex items-center gap-1">
          {messages.length > 0 && !readOnly ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Custom instructions"
                title="Custom instructions"
                onClick={() => setInstructionsOpen(true)}
              >
                <PencilIcon className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Share conversation"
                title="Share with organization"
                onClick={() => setShareOpen(true)}
              >
                {shareCopied ? (
                  <CheckIcon className="size-4" />
                ) : (
                  <ShareIcon className="size-4" />
                )}
              </Button>
              {conversationIsShared ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Stop sharing"
                  title="Stop sharing"
                  onClick={() => {
                    if (!activeId) return;
                    void unshareConversation(activeId).then((result) => {
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      setConversations((prev) =>
                        prev.map((item) =>
                          item.id === activeId
                            ? { ...item, isShared: false }
                            : item,
                        ),
                      );
                    });
                  }}
                >
                  <Link2OffIcon className="size-4" />
                </Button>
              ) : null}
            </>
          ) : null}
          {messages.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Export conversation"
              title="Export as Markdown"
              onClick={exportConversation}
            >
              <DownloadIcon className="size-4" />
            </Button>
          ) : null}
          </div>
        </header>

        {readOnly ? (
          <div className="border-b border-primary/20 bg-primary/5 px-4 py-2 text-center text-xs text-muted-foreground">
            Shared conversation — read only. Sign in to your workspace to start
            your own chats.
          </div>
        ) : null}

        {!providerConnected && !publicView ? (
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
          className={cn(
            'flex min-h-0 w-full flex-1 flex-col',
            messages.length === 0 &&
              !loadingConversation &&
              'items-center justify-center',
          )}
        >
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className={cn(
            'overflow-y-auto scroll-smooth',
            messages.length === 0 && !loadingConversation ? 'w-full' : 'flex-1',
          )}
        >
          <div className={cn(chatColumnClass, 'py-6')}>
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
              <div className="relative flex flex-col items-center justify-center gap-8 py-8 text-center">
                {readOnly ? (
                  <div>
                    <p className="text-lg font-semibold">Shared conversation</p>
                    <p className="mt-1 text-sm text-shell-muted">
                      This shared conversation has no messages yet.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <span className="mb-6 flex size-[72px] items-center justify-center rounded-[22px] border border-white/10 bg-white/[0.04] shadow-[0_0_40px_rgba(255,255,255,0.08)]">
                      <img
                        src="/brand/logo-mark.svg"
                        alt=""
                        width={32}
                        height={38}
                      />
                    </span>
                    <h2 className="text-[32px] leading-10 font-semibold tracking-[-1.2px] text-white sm:text-[40px] sm:leading-[48px] sm:tracking-[-1.6px]">
                      Hello, {firstName}
                    </h2>
                    <p className="mt-1 flex flex-wrap items-center justify-center gap-2 text-center text-[28px] leading-10 font-normal tracking-[-1px] text-[#a1a1aa] sm:text-[40px] sm:leading-[48px] sm:tracking-[-1.6px]">
                      <span>How can</span>
                      <img
                        src="/brand/logo-mark.svg"
                        alt=""
                        width={34}
                        height={40}
                        className="rotate-12"
                      />
                      <span className="text-gradient-title font-semibold">We can</span>
                      <span>help you?</span>
                    </p>
                    {activeProject ? (
                      <p className="mt-2 text-[16px] leading-7 text-shell-muted">
                        Start a chat inside {activeProject.name}.
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-8">
                {liveTools.length || citations.length ? (
                  <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
                    {liveTools.map((tool) => (
                      <p key={tool.title} className="text-xs text-muted-foreground">
                        {tool.status === 'running' ? '…' : '✓'} {tool.title}
                        {tool.detail ? ` · ${tool.detail}` : ''}
                      </p>
                    ))}
                    {citations.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {citations.map((citation) =>
                          citation.url ? (
                            <a
                              key={citation.id}
                              href={citation.url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted"
                            >
                              {citation.title}
                            </a>
                          ) : (
                            <span
                              key={citation.id}
                              className="rounded-md border border-border bg-background px-2 py-1 text-[11px]"
                            >
                              {citation.title}
                            </span>
                          ),
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {visibleMessages.map((message, index) => {
                  const next = visibleMessages[index + 1];
                  const previous = visibleMessages[index - 1];
                  if (
                    message.metadata?.compareSlot === 1 &&
                    previous?.metadata?.compareSlot === 0
                  ) {
                    return null;
                  }
                  if (
                    message.metadata?.compareSlot === 0 &&
                    next?.metadata?.compareSlot === 1
                  ) {
                    return (
                      <div
                        key={`${message.id}-${next.id}`}
                        className="space-y-3"
                      >
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div className="min-w-0 rounded-xl border border-border p-3">
                            <p className="mb-3 text-[11px] font-medium text-muted-foreground">
                              Response A
                            </p>
                            {renderMessageRow(message, index)}
                          </div>
                          <div className="min-w-0 rounded-xl border border-border p-3">
                            <p className="mb-3 text-[11px] font-medium text-muted-foreground">
                              Response B
                            </p>
                            {renderMessageRow(next, index + 1)}
                          </div>
                        </div>
                        {!readOnly && !sending ? (
                          <div className="flex flex-wrap justify-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void pickCompare(message.id)}
                            >
                              Use response A
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void pickCompare(next.id)}
                            >
                              Use response B
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void mergeCompare(message.id)}
                            >
                              Merge both
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  }
                  return (
                    <div key={message.id}>{renderMessageRow(message, index)}</div>
                  );
                })}
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

        <div
          className={cn(
            'w-full',
            messages.length > 0 || loadingConversation
              ? 'border-t border-shell-line'
              : undefined,
          )}
        >
          <div className={cn(chatColumnClass, 'py-3 sm:py-4')}>
            {error ? (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <p>{error}</p>
                {failedMessage && !readOnly ? (
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

            {readOnly ? (
              <p className="text-center text-xs text-muted-foreground">
                This shared conversation is read-only.
              </p>
            ) : (
            <>
            {attachments.some(isImageAttachment) ||
            pendingUploads.some((file) => file.previewUrl) ? (
              <div className="relative z-10 mb-[-14px] flex flex-wrap justify-start gap-3 pl-4">
                {attachments.filter(isImageAttachment).map((file) => (
                  <div key={file.id} className="relative size-16">
                    {file.previewUrl ? (
                      <img
                        src={file.previewUrl}
                        alt=""
                        className="size-16 rounded-[10px] border border-white/10 object-cover"
                      />
                    ) : (
                      <span className="flex size-16 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04] text-[10px] text-[#a1a1aa]">
                        Image
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
                        setAttachments((previous) =>
                          previous.filter((item) => item.id !== file.id),
                        );
                      }}
                      className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-white/20 bg-[#2a2a2a] text-white shadow-sm hover:bg-[#3a3a3a]"
                      title="Remove image"
                      aria-label={`Remove ${file.filename}`}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </div>
                ))}
                {pendingUploads
                  .filter((file) => file.previewUrl)
                  .map((file) => (
                    <div key={file.key} className="relative size-16">
                      <img
                        src={file.previewUrl}
                        alt=""
                        className="size-16 rounded-[10px] border border-white/10 object-cover"
                      />
                      {file.stage !== 'uploading' ? null : (
                        <span className="absolute inset-0 flex items-center justify-center rounded-[10px] bg-black/35">
                          <LoaderCircleIcon className="size-4 animate-spin text-white" />
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          cancelledUploads.current.add(file.key);
                          if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
                          setPendingUploads((current) =>
                            current.filter((item) => item.key !== file.key),
                          );
                        }}
                        className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-white/20 bg-[#2a2a2a] text-white shadow-sm hover:bg-[#3a3a3a]"
                        title="Remove image"
                        aria-label={`Remove ${file.filename}`}
                      >
                        <XIcon className="size-3" />
                      </button>
                    </div>
                  ))}
              </div>
            ) : null}
            {voice.endedLabel ? (
              <div className="mb-2 flex justify-center">
                <button
                  type="button"
                  onClick={voice.dismissEnded}
                  className="rounded-full border border-white/10 bg-[#1c1c1c] px-3 py-1.5 text-xs text-[#d4d4d8] hover:bg-white/10"
                >
                  {voice.endedLabel}
                </button>
              </div>
            ) : null}
            <form
              onSubmit={handleSend}
              className="rounded-[22px] border border-white/10 bg-[#161616] transition-colors focus-within:border-white/25"
            >
              {attachments.some((file) => !isImageAttachment(file)) ||
              pendingUploads.some((file) => !file.previewUrl) ? (
                <div className="flex flex-wrap gap-2 border-b border-white/10 p-3">
                  {attachments
                    .filter((file) => !isImageAttachment(file))
                    .map((file) => (
                    <div
                      key={file.id}
                      className="flex min-w-0 max-w-64 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-white"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-white">
                        <FileIcon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">
                          {file.filename}
                        </span>
                        <span className="block text-[11px] text-[#a1a1aa]">
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
                        className="rounded p-1 text-[#a1a1aa] transition hover:bg-white/10 hover:text-white"
                        title="Remove attachment"
                        aria-label={`Remove ${file.filename}`}
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  {pendingUploads
                    .filter((file) => !file.previewUrl)
                    .map((file) => (
                    <div
                      key={file.key}
                      className="flex min-w-0 max-w-64 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-white"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-white">
                        <LoaderCircleIcon className="size-4 animate-spin" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">
                          {file.filename}
                        </span>
                        <span className="block text-[11px] text-[#a1a1aa]">
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
                onChange={(event) => voice.onComposerChange(event.target.value)}
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
                placeholder="Describe what you want to build"
                aria-label="Message"
                className="max-h-50 min-h-[72px] resize-none rounded-none border-0 bg-transparent px-4 pt-4 shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
                disabled={sending || !providerConnected}
              />

              {voice.listening ? (
                <p className="px-4 pt-3 text-xs text-[#a1a1aa]" role="status">
                  Listening. Speak naturally, then send.
                </p>
              ) : null}
              {voice.speaking ? (
                <p className="px-4 pt-3 text-xs text-[#a1a1aa]" role="status">
                  Speaking the reply. The microphone interrupts it.
                </p>
              ) : null}
              <div className="flex items-center gap-2 px-3 pb-3">
                <button
                  type="button"
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/80 transition hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40',
                    voice.listening && 'border-white/40 bg-white/15 text-white',
                    voice.speaking && 'animate-pulse',
                  )}
                  disabled={sending || !providerConnected}
                  aria-pressed={voice.listening}
                  title={
                    voice.listening
                      ? 'Stop voice input'
                      : voice.speaking
                        ? 'Stop speaking and listen'
                        : 'Voice input'
                  }
                  aria-label={
                    voice.listening
                      ? 'Stop voice input'
                      : voice.speaking
                        ? 'Stop speaking and listen'
                        : 'Start voice input'
                  }
                  onClick={voice.toggle}
                >
                  <MicIcon className="size-3.5" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/80 transition hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40"
                      disabled={sending}
                      aria-label="Chat tools"
                      title="Web search and compare"
                    >
                      <SlidersHorizontalIcon className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top" className="w-56">
                    <DropdownMenuCheckboxItem
                      checked={webSearch}
                      onCheckedChange={(checked) => {
                        setWebSearch(checked);
                        if (activeId) {
                          void updateConversation(activeId, {
                            webSearchEnabled: checked,
                          });
                        }
                      }}
                    >
                      Web search
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Compare</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={compareModel || 'none'}
                      onValueChange={(value) =>
                        setCompareModel(value === 'none' ? '' : value)
                      }
                    >
                      <DropdownMenuRadioItem value="none">
                        No compare
                      </DropdownMenuRadioItem>
                      {availableModels
                        .filter((item) => item.id !== model)
                        .map((item) => (
                          <DropdownMenuRadioItem key={item.id} value={item.id}>
                            vs {item.label}
                          </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/80 transition hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40"
                      disabled={sending || attachmentsFull}
                      title="Add files"
                      aria-label="Add files"
                    >
                      <PaperclipIcon className="size-3.5" />
                    </button>
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
                  accept=".png,.jpg,.jpeg,.gif,.webp,.txt,.md,.csv,.json,.pdf,.docx,image/png,image/jpeg,image/gif,image/webp,text/plain,text/markdown,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
                    className="ml-auto h-8 w-auto max-w-[9.5rem] shrink-0 rounded-full border border-white/15 bg-transparent px-3 text-xs shadow-none"
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

                {sending ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="shrink-0 rounded-full"
                    onClick={stopGeneration}
                    aria-label="Stop generating"
                    title="Stop generating"
                  >
                    <SquareIcon className="size-3.5 fill-current" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    size="icon"
                    className="size-8 shrink-0 rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/20"
                    disabled={!canSend}
                    aria-label="Send message"
                  >
                    <SparklesIcon className="size-3.5" />
                  </Button>
                )}
              </div>
            </form>
            </>
            )}
          </div>
        </div>
        </div>
      </section>

      {activeCanvas && isLargeScreen ? (
        <CanvasSidePanel
          artifact={activeCanvas}
          onClose={() => setActiveCanvas(null)}
        />
      ) : null}

      <CanvasModal
        artifact={activeCanvas}
        open={Boolean(activeCanvas) && !isLargeScreen}
        onClose={() => setActiveCanvas(null)}
      />

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

      <Dialog open={projectSettingsOpen} onOpenChange={setProjectSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Project settings</DialogTitle>
            <DialogDescription>
              Instructions and files apply to every new chat in this project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Default model
              </label>
              <Select
                value={projectDefaultModel || 'none'}
                onValueChange={(value) =>
                  setProjectDefaultModel(value === 'none' ? '' : value)
                }
              >
                <SelectTrigger aria-label="Project default model">
                  <SelectValue placeholder="Same as workspace default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Workspace default</SelectItem>
                  {modelsByProvider.map(([provider, providerModels]) => (
                    <SelectGroup key={provider}>
                      <SelectLabel>
                        {PROVIDER_LABELS[provider] ?? provider}
                      </SelectLabel>
                      {providerModels.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Project instructions
              </label>
              <Textarea
                value={projectInstructions}
                onChange={(event) => setProjectInstructions(event.target.value)}
                rows={5}
                placeholder="Tone, goals, or context for chats in this project…"
                aria-label="Project instructions"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Attached workspace files
              </label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                {libraryFiles.length ? (
                  libraryFiles.map((file) => {
                    const checked = projectFileIds.includes(file.id);
                    return (
                      <label
                        key={file.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/60"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setProjectFileIds((prev) =>
                              checked
                                ? prev.filter((id) => id !== file.id)
                                : [...prev, file.id],
                            )
                          }
                        />
                        <span className="truncate">{file.filename}</span>
                      </label>
                    );
                  })
                ) : (
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    No files in your library yet.
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setProjectSettingsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!activeProjectId) return;
                void updateChatFolder(activeProjectId, {
                  instructions: projectInstructions.trim() || null,
                  defaultModel: projectDefaultModel || null,
                  fileIds: projectFileIds,
                }).then((result) => {
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setFolders((prev) =>
                    prev.map((item) =>
                      item.id === activeProjectId ? result.data : item,
                    ),
                  );
                  if (!activeId) {
                    setModel(resolveProjectModel(result.data));
                  }
                  setProjectSettingsOpen(false);
                });
              }}
            >
              Save project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ChatShareDialog
        open={shareOpen}
        expiry={shareExpiry}
        onOpenChange={setShareOpen}
        onExpiryChange={setShareExpiry}
        onCopy={() => {
          if (!activeId) return;
          void shareConversation(activeId, shareExpiry).then((result) => {
            if (!result.ok) {
              setError(result.error);
              return;
            }
            const url = `${window.location.origin}/share/${result.data.shareToken}`;
            void navigator.clipboard.writeText(url);
            setShareCopied(true);
            window.setTimeout(() => setShareCopied(false), 2000);
            setConversations((prev) =>
              prev.map((item) =>
                item.id === activeId ? { ...item, isShared: true } : item,
              ),
            );
            setShareOpen(false);
            setError('');
          });
        }}
      />

      <Dialog open={instructionsOpen} onOpenChange={setInstructionsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Custom instructions</DialogTitle>
            <DialogDescription>
              These notes apply only to this conversation and are included in
              the model prompt.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            rows={8}
            placeholder="Tone, format, audience, or facts the assistant should always follow…"
            aria-label="Custom instructions"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setInstructionsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!activeId) {
                  setInstructionsOpen(false);
                  return;
                }
                void updateConversation(activeId, { instructions }).then(
                  (result) => {
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setInstructionsOpen(false);
                  },
                );
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
