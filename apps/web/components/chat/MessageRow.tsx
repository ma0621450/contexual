'use client';

import { useState } from 'react';
import {
  CheckIcon,
  CopyIcon,
  FileIcon,
  PencilIcon,
  RefreshCwIcon,
  SparklesIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import type { ChatMessage } from '@/lib/api/server';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageContent } from './MessageContent';
import { Markdown } from './Markdown';
import type { CanvasArtifact } from './parseMessageContent';

type MessageUsage = {
  promptTokens: number;
  completionTokens: number;
  estimatedCostCents: number;
  model: string;
};

export function MessageRow({
  message,
  streaming,
  usage,
  isLastAssistant,
  sending,
  onOpenCanvas,
  onContinueClarifying,
  onRegenerate,
  onEdit,
  onDelete,
  onFeedback,
  branchIndex,
  branchCount,
  onBranch,
}: {
  message: ChatMessage;
  streaming: boolean;
  usage?: MessageUsage;
  isLastAssistant?: boolean;
  sending?: boolean;
  onOpenCanvas: (artifact: CanvasArtifact) => void;
  onContinueClarifying?: (message: string) => void;
  onRegenerate?: () => void;
  onEdit?: (content: string) => void;
  onDelete?: () => void;
  onFeedback?: (rating: 'up' | 'down' | 'none') => void;
  branchIndex?: number;
  branchCount?: number;
  onBranch?: (direction: -1 | 1) => void;
}) {
  const isUser = message.role === 'USER';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const feedback = message.metadata?.feedback;
  const canMutate =
    !message.id.startsWith('temp-') && !streaming && !sending;

  if (isUser) {
    return (
      <div className="group/message flex justify-end">
        <div className="max-w-[85%] min-w-0 space-y-2 sm:max-w-[75%]">
          {editing ? (
            <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={4}
                className="min-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(message.content);
                    setEditing(false);
                  }}
                >
                  <XIcon className="size-3.5" />
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!draft.trim() || draft.trim() === message.content}
                  onClick={() => {
                    setEditing(false);
                    onEdit?.(draft.trim());
                  }}
                >
                  Save & resend
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground">
              <div className="text-[0.9375rem] leading-7 [&_.markdown-body]:text-primary-foreground [&_a]:text-primary-foreground">
                <Markdown content={message.content} />
              </div>
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
          )}
          {!editing ? (
            <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:focus-within:opacity-100 sm:group-hover/message:opacity-100">
              <MessageCopyButton content={message.content} />
              {onEdit && canMutate ? (
                <ActionButton
                  label="Edit message"
                  onClick={() => {
                    setDraft(message.content);
                    setEditing(true);
                  }}
                >
                  <PencilIcon className="size-3.5" />
                  Edit
                </ActionButton>
              ) : null}
              {onDelete && canMutate ? (
                <ActionButton label="Delete message" onClick={onDelete} danger>
                  <Trash2Icon className="size-3.5" />
                  Delete
                </ActionButton>
              ) : null}
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
        <MessageContent
          content={message.content}
          streaming={streaming}
          disabled={sending}
          onOpenCanvas={onOpenCanvas}
          onContinueClarifying={
            isLastAssistant && !streaming ? onContinueClarifying : undefined
          }
        />

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
          <div className="mt-2 flex flex-wrap items-center gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:focus-within:opacity-100 sm:group-hover/message:opacity-100">
            <MessageCopyButton content={message.content} />
            {branchCount && branchCount > 1 && onBranch ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={() => onBranch(-1)}
                  className="rounded px-1 hover:bg-muted"
                  aria-label="Previous branch"
                >
                  ‹
                </button>
                {branchIndex}/{branchCount}
                <button
                  type="button"
                  onClick={() => onBranch(1)}
                  className="rounded px-1 hover:bg-muted"
                  aria-label="Next branch"
                >
                  ›
                </button>
              </span>
            ) : null}
            {onRegenerate && isLastAssistant ? (
              <ActionButton label="Regenerate response" onClick={onRegenerate}>
                <RefreshCwIcon className="size-3.5" />
                Regenerate
              </ActionButton>
            ) : null}
            {onFeedback && canMutate ? (
              <>
                <ActionButton
                  label="Good response"
                  active={feedback === 'up'}
                  onClick={() =>
                    onFeedback(feedback === 'up' ? 'none' : 'up')
                  }
                >
                  <ThumbsUpIcon className="size-3.5" />
                </ActionButton>
                <ActionButton
                  label="Bad response"
                  active={feedback === 'down'}
                  onClick={() =>
                    onFeedback(feedback === 'down' ? 'none' : 'down')
                  }
                >
                  <ThumbsDownIcon className="size-3.5" />
                </ActionButton>
              </>
            ) : null}
            {onDelete && canMutate ? (
              <ActionButton label="Delete message" onClick={onDelete} danger>
                <Trash2Icon className="size-3.5" />
                Delete
              </ActionButton>
            ) : null}
            {usage ? (
              <span className="ml-1 text-[11px] text-muted-foreground">
                {usage.promptTokens + usage.completionTokens} tokens
                {usage.estimatedCostCents > 0
                  ? ` · $${(usage.estimatedCostCents / 100).toFixed(4)}`
                  : ''}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  label,
  onClick,
  active,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
        active
          ? 'bg-primary/10 text-primary'
          : danger
            ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
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
