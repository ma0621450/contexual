'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BrandMark, Spotlight } from './AuthShell';
import { Emoji } from './AuthControls';

const EMOJI_PATTERN = /(\p{Extended_Pictographic}\uFE0F?)/u;

function withEmoji(text: string) {
  return text
    .split(EMOJI_PATTERN)
    .map((part, index) =>
      index % 2 === 1 ? <Emoji key={index}>{part}</Emoji> : part,
    );
}

/** Full-screen status message between auth steps (Figma: Hold Tight, Creating Your Workspace…). */
export function TransitionScreen({
  message,
  footer,
}: {
  message: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-base text-white"
      role="status"
      aria-live="polite"
    >
      <Spotlight stars="transition" />
      <div className="absolute inset-0 flex items-center justify-center px-6">
        <p
          key={typeof message === 'string' ? message : undefined}
          className="text-gradient-title animate-fade-slide-in pb-[0.14em] text-center text-[clamp(36px,7vw,56px)] leading-[0.97] tracking-[-2.24px]"
        >
          {typeof message === 'string' ? withEmoji(message) : message}
        </p>
      </div>
      {footer ? (
        <p className="absolute inset-x-0 bottom-[47px] text-center text-[16px] text-sub">
          {footer}
        </p>
      ) : null}
    </div>
  );
}

/** Plain success screen used after signing in (Figma: Success Welcome Back…). */
export function SuccessScreen({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-base text-white" role="status" aria-live="polite">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/corner-glow.svg"
        alt=""
        aria-hidden
        width={636.6}
        height={633.6}
        className="pointer-events-none absolute top-[-283.3px] left-[-265.3px] max-w-none"
      />
      <BrandMark className="absolute top-[34px] right-[44px]" />
      <div className="absolute inset-0 flex items-center justify-center px-6">
        <p className="text-gradient-title animate-fade-slide-in w-[344px] max-w-full pb-[0.14em] text-center text-[39px] leading-[81.27%] tracking-[-1.56px]">
          {children}
        </p>
      </div>
    </div>
  );
}

const STEP_MS = 1100;

/**
 * Steps through status messages while `task` runs, never faster than STEP_MS per
 * message, and resolves once both the task and the final message have shown.
 */
export function useTransitionSequence() {
  const [message, setMessage] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  async function run<T>(messages: string[], task: () => Promise<T>): Promise<T> {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let failed = false;
    const work = task();
    work.catch(() => {
      failed = true;
    });

    for (const step of messages.slice(0, -1)) {
      if (failed || cancelled.current) break;
      setMessage(step);
      await wait(STEP_MS);
    }

    let result: T;
    try {
      result = await work;
    } catch (error) {
      setMessage(null);
      throw error;
    }

    setMessage(messages[messages.length - 1] ?? null);
    await wait(STEP_MS);
    return result;
  }

  return { message, run, clear: () => setMessage(null) };
}
