/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { PlusIcon } from 'lucide-react';
import type { ConversationSummary, MemoryItem, StoredFile } from '@/lib/api/server';
import { JoinInviteForm } from './JoinInviteForm';
import {
  previewLines,
  setupProgress,
  setupSteps,
  type SetupStep,
} from './overview-model';

const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-white/50';

type OverviewViewProps = {
  firstName: string;
  providerConnected: boolean | null;
  conversations: ConversationSummary[];
  files: StoredFile[];
  memories: MemoryItem[];
};

export function OverviewView({
  firstName,
  providerConnected,
  conversations,
  files,
  memories,
}: OverviewViewProps) {
  const activeChats = conversations.filter((conversation) => !conversation.isArchived);
  const steps = setupSteps({
    providerConnected,
    hasConversation: activeChats.length > 0,
    hasContext: files.length > 0 || memories.length > 0,
  });
  const progress = setupProgress(steps);
  const cards = [
    {
      href: '/dashboard/chat',
      icon: '/brand/nav/chat.svg',
      title: 'Chats',
      action: 'Open chat',
      plus: false,
      lines: previewLines(
        activeChats.map((conversation) => conversation.title || 'Untitled chat'),
        'No conversations yet',
      ),
    },
    {
      href: '/dashboard/files',
      icon: '/brand/nav/files.svg',
      title: 'Files',
      action: 'Add files',
      plus: true,
      lines: previewLines(
        files.map((file) => file.filename),
        'No files yet',
      ),
    },
    {
      href: '/dashboard/memories',
      icon: '/brand/nav/memories.svg',
      title: 'Memories',
      action: 'Add a memory',
      plus: true,
      lines: previewLines(
        memories.map((memory) => memory.title),
        'No memories yet',
      ),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[791px] flex-col items-center px-4 pt-16 pb-10 sm:px-6 sm:pt-[72px]">
      <h1 className="text-center text-[32px] leading-10 font-semibold tracking-[-1.2px] text-white sm:text-[48px] sm:leading-[56px] sm:tracking-[-1.92px]">
        Hello, {firstName}
      </h1>
      <p className="flex flex-wrap items-center justify-center gap-2 text-center text-[28px] leading-10 font-normal tracking-[-1px] text-[#a1a1aa] sm:gap-2 sm:text-[48px] sm:leading-[56px] sm:tracking-[-1.92px]">
        <span>How can</span>
        <img
          src="/brand/logo-mark.svg"
          alt=""
          width={40.392}
          height={48}
          className="rotate-12"
        />
        <span className="text-gradient-title font-semibold">We can</span>
        <span>help you?</span>
      </p>

      <section
        aria-label="Getting started"
        className="relative mt-14 w-full overflow-hidden rounded-[16px] border border-white/20 bg-[rgba(23,23,23,0.06)] px-4 pt-4 pb-6 backdrop-blur-[42px]"
      >
        <h2 className="text-[18px] leading-7 font-semibold tracking-[-0.36px] text-white">
          🎉 Getting started with Promplex
        </h2>
        <div
          className="mt-4 h-1 overflow-hidden rounded-full bg-[#1d1d1d]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          aria-label="Setup progress"
        >
          <div
            className="h-full rounded-full bg-white"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <ul className="mt-4 flex flex-col gap-2">
          {steps.map((step) => (
            <li key={step.id}>
              <SetupRow step={step} />
            </li>
          ))}
        </ul>
        {providerConnected === null ? (
          <p className="mt-3 text-sm text-[#a1a1aa]">
            Provider status could not be loaded.
          </p>
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3 overflow-hidden">
          <img
            src="/brand/nav/card-glow.svg"
            alt=""
            width={1218.6}
            height={473.6}
            className="absolute left-1/2 max-w-none -translate-x-1/2"
            style={{ top: 'calc(8px - 236.8px)' }}
          />
        </div>
      </section>

      <section className="mt-5 w-full">
        <JoinInviteForm />
      </section>

      <h2 className="mt-6 w-full text-[18px] leading-7 font-semibold tracking-[-0.36px] text-white">
        Quick Access
      </h2>
      <section className="mt-4 grid w-full gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.href}
            className="flex min-h-[240px] flex-col rounded-[16px] border border-shell-line bg-shell-raised p-4"
          >
            <img src={card.icon} alt="" width={20} height={20} />
            <h3 className="mt-3 text-[16px] leading-6 font-medium tracking-[-0.16px] text-white">
              {card.title}
            </h3>
            <div className="mt-3 flex flex-1 flex-col gap-1 text-sm leading-5 text-[#5c5c5c]">
              {card.lines.map((line, index) => (
                <p key={`${card.title}-${index}`} className="truncate">
                  {line}
                </p>
              ))}
            </div>
            <Link
              href={card.href}
              className={`mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-shell-hover text-sm font-medium text-white hover:bg-shell-active ${focusRing}`}
            >
              {card.plus ? <PlusIcon className="size-5" aria-hidden /> : null}
              {card.action}
            </Link>
          </article>
        ))}
      </section>
    </div>
  );
}

function SetupRow({ step }: { step: SetupStep }) {
  const body = (
    <>
      <span className={step.done ? 'line-through' : undefined}>{step.label}</span>
      {step.done ? (
        <img src="/brand/nav/check.svg" alt="" width={20} height={20} />
      ) : (
        <span className="size-5 shrink-0 rounded-full border border-white/20" />
      )}
    </>
  );
  const className = `flex items-center justify-between gap-3 text-sm leading-5 tracking-[-0.28px] ${focusRing} rounded-md ${
    step.done ? 'text-sub' : 'text-[#a1a1aa] hover:text-white'
  }`;
  if (step.done) {
    return <p className={className}>{body}</p>;
  }
  return (
    <Link href={step.href} className={className}>
      {body}
    </Link>
  );
}

export function OverviewSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-[791px] flex-col items-center gap-4 px-4 py-12"
      aria-label="Loading overview"
      aria-busy="true"
    >
      <div className="h-12 w-64 animate-pulse rounded-lg bg-white/5" />
      <div className="h-12 w-full max-w-xl animate-pulse rounded-lg bg-white/5" />
      <div className="mt-6 h-44 w-full animate-pulse rounded-[16px] bg-white/5" />
      <div className="mt-4 grid w-full gap-4 md:grid-cols-3">
        <div className="h-60 animate-pulse rounded-[16px] bg-white/5" />
        <div className="h-60 animate-pulse rounded-[16px] bg-white/5" />
        <div className="h-60 animate-pulse rounded-[16px] bg-white/5" />
      </div>
    </div>
  );
}
