'use client';

import { useEffect, useState } from 'react';
import { BrainIcon, ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ThinkingBlock({
  content,
  streaming = false,
  defaultOpen,
}: {
  content: string;
  streaming?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? streaming);

  useEffect(() => {
    if (streaming) setOpen(true);
  }, [streaming]);

  const empty = content.trim().length === 0;

  return (
    <div
      className={cn(
        'my-3 overflow-hidden rounded-xl border border-border/80 bg-muted/30',
        streaming && 'border-primary/25',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50"
        aria-expanded={open}
      >
        <span
          className={cn(
            'flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary',
            streaming && 'animate-pulse',
          )}
        >
          <BrainIcon className="size-3.5" />
        </span>
        <span className="flex-1 font-medium text-foreground">
          {streaming ? 'Thinking' : 'Thought process'}
        </span>
        {streaming ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-current" />
          </span>
        ) : null}
        {open ? (
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        )}
      </button>
      {open ? (
        <div className="border-t border-border/70 px-3 py-2.5">
          {empty ? (
            <p className="text-sm text-muted-foreground italic">
              Analyzing the request…
            </p>
          ) : (
            <pre className="max-h-64 overflow-auto font-sans text-[13px] leading-6 whitespace-pre-wrap text-muted-foreground">
              {content}
            </pre>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function AnalyzingIndicator() {
  return (
    <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
        <BrainIcon className="size-3.5 animate-pulse" />
      </span>
      <span className="font-medium text-foreground">Analyzing</span>
      <span className="flex items-center gap-1">
        <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-current" />
      </span>
    </div>
  );
}
