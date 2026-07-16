import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ActivityIcon,
  ArrowRightIcon,
  CreditCardIcon,
  type LucideIcon,
  MessagesSquareIcon,
  PlugIcon,
  SparklesIcon,
  UsersIcon,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/api/server';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type QuickAction = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

const quickActions: QuickAction[] = [
  {
    href: '/dashboard/chat',
    title: 'Open chat',
    description: 'Start a conversation across any connected AI provider.',
    icon: MessagesSquareIcon,
  },
  {
    href: '/dashboard/memories',
    title: 'Memories',
    description: 'Manage reusable context for you and your organization.',
    icon: SparklesIcon,
  },
  {
    href: '/dashboard/team',
    title: 'Manage team',
    description: 'Invite teammates, set roles, and manage membership.',
    icon: UsersIcon,
  },
  {
    href: '/dashboard/providers',
    title: 'AI providers',
    description: 'Connect OpenAI, Anthropic, Gemini, or xAI keys.',
    icon: PlugIcon,
  },
  {
    href: '/dashboard/usage',
    title: 'Usage & billing',
    description: 'Track spend, set limits, and manage your plan.',
    icon: CreditCardIcon,
    adminOnly: true,
  },
  {
    href: '/dashboard/audit',
    title: 'Audit log',
    description: 'Review every sensitive action across the workspace.',
    icon: ActivityIcon,
    adminOnly: true,
  },
];

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (!user.emailVerifiedAt) {
    redirect('/verify-email');
  }

  if (user.memberships.length === 0) {
    redirect('/onboarding');
  }

  const isAdmin = user.role === 'ADMIN';
  const actions = quickActions.filter(
    (action) => !action.adminOnly || isAdmin,
  );
  const firstName = user.name.split(' ')[0] ?? user.name;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="rounded-2xl border border-border bg-gradient-to-br from-accent to-card p-8">
        <p className="text-sm font-medium text-primary">Welcome back</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">
          Hi {firstName}, your workspace is ready.
        </h2>
        <p className="mt-2 max-w-xl text-muted-foreground">
          Jump into a conversation, manage your team, or fine-tune how your
          organization uses AI.
        </p>
        <Link
          href="/dashboard/chat"
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Start chatting
          <ArrowRightIcon className="size-4" />
        </Link>
      </div>

      <div className="mt-8">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Quick actions
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.href} href={action.href} className="group">
                <Card className="h-full gap-0 py-5 transition-shadow hover:shadow-elevated">
                  <CardHeader>
                    <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="size-5" />
                    </span>
                    <CardTitle className="mt-4 flex items-center justify-between">
                      {action.title}
                      <ArrowRightIcon className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </CardTitle>
                    <CardDescription>{action.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
