'use client';

import { useEffect, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';

function ThinkingPill({ label = 'Thinking' }: { label?: string }) {
  return (
    <span className="thinking-pill" role="status">
      <span className="thinking-pill-spark" aria-hidden="true" />
      <span>
        {label}
        <span className="thinking-ellipsis" aria-hidden="true" />
      </span>
    </span>
  );
}

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

  if (streaming) {
    return (
      <div className="my-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-full focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
          aria-expanded={open}
          aria-label="Thinking"
        >
          <ThinkingPill />
        </button>
        {open && !empty ? (
          <div className="thinking-process mt-3 max-w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <pre className="max-h-64 overflow-auto font-sans text-[13px] leading-6 whitespace-pre-wrap text-[#a1a1aa]">
              {content}
              <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-[#d4d4d8] align-text-bottom" />
            </pre>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="my-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[#d4d4d8] transition-colors hover:bg-white/[0.04]"
        aria-expanded={open}
      >
        <span className="flex-1 font-medium">Thought process</span>
        {open ? (
          <ChevronDownIcon className="size-4 text-[#737373]" />
        ) : (
          <ChevronRightIcon className="size-4 text-[#737373]" />
        )}
      </button>
      {open ? (
        <div className="thinking-process border-t border-white/10 px-3 py-2.5">
          <pre className="max-h-64 overflow-auto font-sans text-[13px] leading-6 whitespace-pre-wrap text-[#a1a1aa]">
            {empty ? 'No reasoning was recorded.' : content}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export function AnalyzingIndicator() {
  return <ThinkingPill />;
}
