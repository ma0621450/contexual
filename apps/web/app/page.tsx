import Link from 'next/link';
import {
  ArrowRightIcon,
  BrainIcon,
  GaugeIcon,
  LockIcon,
  MessagesSquareIcon,
  ShieldCheckIcon,
  UsersIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';

const features = [
  {
    icon: MessagesSquareIcon,
    title: 'Multi-model chat',
    description:
      'Chat across OpenAI, Anthropic, Gemini, and xAI from one shared workspace with streaming responses.',
  },
  {
    icon: BrainIcon,
    title: 'Team memories',
    description:
      'Capture reusable context once and inject it into every conversation, scoped to a person or the whole org.',
  },
  {
    icon: GaugeIcon,
    title: 'Spend & token limits',
    description:
      'Set per-member and organization caps with live usage alerts so budgets never get a surprise.',
  },
  {
    icon: UsersIcon,
    title: 'Real collaboration',
    description:
      'Invite teammates, manage roles, transfer ownership, and keep everyone in the same secure space.',
  },
  {
    icon: LockIcon,
    title: 'Keys stay hidden',
    description:
      'Connect a provider key once. It is encrypted at rest and never exposed back to members.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Audit-ready',
    description:
      'Every sensitive action is logged with database-enforced tenant isolation across the platform.',
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="flex items-center gap-2 text-lg font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              P
            </span>
            PromplexAI
          </span>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent)]" />
          <div className="mx-auto flex max-w-4xl flex-col items-center px-6 py-24 text-center sm:py-32">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-accent px-3 py-1 text-sm font-medium text-accent-foreground">
              <span className="flex size-1.5 rounded-full bg-primary" />
              AI collaboration for your whole team
            </span>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              One secure workspace for your team&apos;s AI conversations
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground text-pretty">
              Connect your provider, collaborate with teammates, control
              spending, and keep a full audit trail — without ever sharing API
              keys.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/signup">
                  Create a workspace
                  <ArrowRightIcon />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="group rounded-xl border border-border bg-card p-6 shadow-card transition-shadow hover:shadow-elevated"
                >
                  <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-4 font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-primary px-6 py-16 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-primary-foreground">
              Ready to give your team a shared AI workspace?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-primary-foreground/80">
              Spin up an organization in under a minute. Invite your team and
              start collaborating today.
            </p>
            <div className="mt-8 flex justify-center">
              <Button size="lg" variant="secondary" asChild>
                <Link href="/signup">
                  Get started free
                  <ArrowRightIcon />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} PromplexAI. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-foreground">
              Sign in
            </Link>
            <Link href="/signup" className="hover:text-foreground">
              Get started
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
