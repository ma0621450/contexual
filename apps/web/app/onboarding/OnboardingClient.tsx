'use client';

import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  inviteSignupSchema,
  joinOrganizationSchema,
} from '@/lib/validations/auth';
import { apiFetch, type ApiResult } from '@/lib/api/client';
import { AuthCenteredLayout } from '@/components/auth/AuthShell';
import {
  AuthButton,
  AuthButtonLink,
  AuthFooter,
  AuthHeading,
  AuthInput,
  AuthNotice,
  AuthTextButton,
  Emoji,
  PasswordInput,
} from '@/components/auth/AuthControls';
import {
  TransitionScreen,
  useTransitionSequence,
} from '@/components/auth/TransitionScreen';
import type { CurrentUser } from '@/lib/api/server';
import {
  getInviteAuthHref,
  getInviteReturnPath,
} from '@/lib/auth/return-path';
import { collectFieldErrors } from '@/lib/auth/form';
import {
  CreateWorkspaceForm,
  type CreateWorkspaceInput,
} from './CreateWorkspaceForm';

type OnboardingStep = 'choice' | 'create' | 'join' | 'invite';

type InvitePreview = {
  organizationId: string;
  organizationName: string;
  email: string;
  hasAccount: boolean;
};

const CREATE_SEQUENCE = [
  'Hold Tight',
  'Creating Your Workspace..',
  'Signing You In',
  'Welcome to Promplex 🎉',
];
const JOIN_SEQUENCE = ['Hold Tight', 'Signing You In', 'Welcome to Promplex 🎉'];
const REDIRECT_FOOTER = 'Redirecting You to the Dashboard';

type OnboardingPageProps = {
  currentUser: CurrentUser | null;
};

function describeJoinError(result: Extract<ApiResult<unknown>, { ok: false }>) {
  if (result.status === 403) {
    return result.error === 'Forbidden'
      ? 'This invitation cannot be accepted by this account. Sign in with the invited email, verify it, and try again.'
      : result.error;
  }
  if (result.status === 409) {
    return result.error.toLowerCase().includes('already')
      ? 'You are already a member. Go to the workspace or refresh your account.'
      : `${result.error} Ask an organization admin for a new invitation if needed.`;
  }
  return result.error;
}

function StepLayout({
  backdrop,
  width = 438,
  children,
}: {
  backdrop: 'spotlight' | 'invite';
  width?: 438 | 468;
  children: ReactNode;
}) {
  return (
    <AuthCenteredLayout backdrop={backdrop} width={width}>
      <div key={backdrop + width} className="animate-fade-slide-in">
        {children}
      </div>
    </AuthCenteredLayout>
  );
}

export default function OnboardingPage({ currentUser }: OnboardingPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite') ?? '';
  const legacyInviteProof = searchParams.get('proof') ?? '';
  const inviteProof = useRef('');
  const autoAcceptRequested = searchParams.get('accept') === '1';
  const createRequested = searchParams.get('action') === 'create';

  const [step, setStep] = useState<OnboardingStep>(
    inviteToken ? 'invite' : createRequested ? 'create' : 'choice',
  );
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [inviteError, setInviteError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(Boolean(inviteToken));
  const [inviteCode, setInviteCode] = useState('');
  const [inviteeName, setInviteeName] = useState('');
  const [inviteePassword, setInviteePassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const autoAcceptAttempted = useRef(false);
  const transition = useTransitionSequence();

  useEffect(() => {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const proof = hash.get('proof') || legacyInviteProof;
    if (proof) inviteProof.current = proof;
    if (!hash.has('proof') && !url.searchParams.has('proof')) return;
    hash.delete('proof');
    url.searchParams.delete('proof');
    url.hash = hash.toString();
    window.history.replaceState(window.history.state, '', url.toString());
  }, [legacyInviteProof]);

  useEffect(() => {
    if (!inviteToken) return;
    let active = true;

    async function loadInvitePreview() {
      setPreviewLoading(true);
      const result = await apiFetch<Partial<InvitePreview>>(
        `/onboarding/invite-preview?token=${encodeURIComponent(inviteToken)}`,
      );
      if (!active) return;
      if (result.ok) {
        setInvite({
          organizationId: result.data.organizationId ?? '',
          organizationName: result.data.organizationName ?? '',
          email: result.data.email ?? '',
          hasAccount: Boolean(result.data.hasAccount),
        });
      } else {
        setInviteError(
          result.networkError ? result.error : 'This invitation is invalid, expired, or has been revoked.',
        );
      }
      setPreviewLoading(false);
    }

    void loadInvitePreview();
    return () => {
      active = false;
    };
  }, [inviteToken]);

  function goTo(next: OnboardingStep) {
    setFormError('');
    setFieldErrors({});
    setStep(next);
  }

  async function finishWithTransition(
    messages: string[],
    task: () => Promise<ApiResult<{ redirectTo?: string }>>,
  ): Promise<ApiResult<{ redirectTo?: string }>> {
    setLoading(true);
    try {
      const result = await transition.run(messages, async () => {
        const response = await task();
        if (!response.ok) throw response;
        return response;
      });
      router.push(result.data.redirectTo ?? '/dashboard');
      router.refresh();
      return result;
    } catch (error) {
      setLoading(false);
      if (error && typeof error === 'object' && 'ok' in error) {
        return error as ApiResult<{ redirectTo?: string }>;
      }
      return { ok: false, error: 'Something went wrong. Please try again.' };
    }
  }

  function createWorkspace(input: CreateWorkspaceInput) {
    return finishWithTransition(CREATE_SEQUENCE, () =>
      apiFetch<{ redirectTo?: string }>('/onboarding/create-organization', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  }

  async function joinOrganization(token: string) {
    if (loading) return;
    setFormError('');
    setFieldErrors({});

    const parsed = joinOrganizationSchema.safeParse({ token });
    if (!parsed.success) {
      setFieldErrors({ token: parsed.error.issues[0]?.message ?? 'Invalid code' });
      return;
    }

    const result = await finishWithTransition(JOIN_SEQUENCE, () =>
      apiFetch<{ redirectTo?: string }>('/onboarding/join-organization', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      }),
    );
    if (!result.ok) setFormError(describeJoinError(result));
  }

  async function handleInviteSignup(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setFormError('');
    setFieldErrors({});

    const parsed = inviteSignupSchema.safeParse({
      name: inviteeName,
      password: inviteePassword,
    });
    if (!parsed.success) {
      setFieldErrors(collectFieldErrors(parsed.error));
      return;
    }

    setLoading(true);
    const result = await apiFetch<{ joined: boolean; redirectTo: string }>(
      '/onboarding/invite-signup',
      {
        method: 'POST',
        body: JSON.stringify({
          token: inviteToken,
          ...(inviteProof.current ? { proof: inviteProof.current } : {}),
          ...parsed.data,
        }),
      },
    );

    if (!result.ok) {
      setLoading(false);
      setFormError(result.error);
      return;
    }

    if (!result.data.joined) {
      router.push(result.data.redirectTo);
      router.refresh();
      return;
    }

    await finishWithTransition(JOIN_SEQUENCE, async () => ({
      ok: true,
      data: { redirectTo: result.data.redirectTo },
    }));
  }

  const normalizedInviteEmail = invite?.email.trim().toLowerCase() ?? '';
  const normalizedCurrentEmail = currentUser?.email.trim().toLowerCase() ?? '';
  const emailMatches =
    Boolean(currentUser) &&
    Boolean(normalizedInviteEmail) &&
    normalizedInviteEmail === normalizedCurrentEmail;
  const existingMembership = currentUser?.memberships.find(
    (membership) => membership.organizationId === invite?.organizationId,
  );
  const inviteReturnPath = getInviteReturnPath(inviteToken);
  const inviteEmail = invite?.email ?? '';
  const loginHref = getInviteAuthHref('/login', inviteEmail, inviteReturnPath);
  const signupHref = getInviteAuthHref('/signup', inviteEmail, inviteReturnPath);

  const acceptInvite = useEffectEvent(() => {
    void joinOrganization(inviteToken);
  });

  const canAutoAccept =
    autoAcceptRequested &&
    !previewLoading &&
    Boolean(invite) &&
    Boolean(currentUser?.emailVerifiedAt) &&
    emailMatches &&
    !existingMembership;

  useEffect(() => {
    if (canAutoAccept && !autoAcceptAttempted.current) {
      autoAcceptAttempted.current = true;
      acceptInvite();
    }
  }, [canAutoAccept]);

  async function signOutTo(href: string) {
    if (loading) return;
    setLoading(true);
    setFormError('');

    const result = await apiFetch<{ ok: true }>('/auth/logout', { method: 'POST' });
    if (!result.ok) {
      setFormError('Unable to sign out. Check your connection and try again.');
      setLoading(false);
      return;
    }

    router.replace(href);
    router.refresh();
  }

  async function goToWorkspace() {
    if (!currentUser || !invite || !existingMembership || loading) return;
    if (currentUser.activeOrganizationId === invite.organizationId) {
      router.push('/dashboard');
      return;
    }

    setLoading(true);
    setFormError('');
    const result = await apiFetch<{ redirectTo?: string }>(
      '/onboarding/switch-organization',
      {
        method: 'POST',
        body: JSON.stringify({ organizationId: invite.organizationId }),
      },
    );
    setLoading(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    router.push(result.data.redirectTo ?? '/dashboard');
    router.refresh();
  }

  if (transition.message) {
    const isFinal = transition.message.startsWith('Welcome');
    return (
      <TransitionScreen
        message={transition.message}
        footer={isFinal ? REDIRECT_FOOTER : undefined}
      />
    );
  }

  if (step === 'invite') {
    return (
      <StepLayout backdrop="invite">
        {renderInvite()}
      </StepLayout>
    );
  }

  if (step === 'create') {
    return (
      <StepLayout backdrop="spotlight" width={468}>
        <CreateWorkspaceForm
          busy={loading}
          onCreate={createWorkspace}
          onSignIn={() => void signOutTo('/login')}
          onJoinInstead={() => goTo('join')}
        />
      </StepLayout>
    );
  }

  if (step === 'join') {
    return (
      <StepLayout backdrop="spotlight">
        <div className="flex flex-col gap-[68px]">
          <AuthHeading
            align="center"
            title={
              <>
                Join Your Team <Emoji>🤝</Emoji>
              </>
            }
            subtitle="Paste the invite code your workspace admin shared with you"
          />
          <div className="flex flex-col items-center gap-[37px]">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void joinOrganization(inviteCode.trim());
              }}
              noValidate
              className="flex w-full flex-col gap-[39px]"
            >
              <div className="flex flex-col gap-[22px]">
                <AuthNotice tone="error">{formError}</AuthNotice>
                <AuthInput
                  label="Invite Code"
                  name="inviteCode"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Please enter your invite code"
                  value={inviteCode}
                  onChange={(event) => {
                    setInviteCode(event.target.value);
                    setFieldErrors({});
                  }}
                  error={fieldErrors.token}
                  hint={
                    currentUser
                      ? `Invite codes only work for the email they were sent to (${currentUser.email}).`
                      : undefined
                  }
                  autoFocus
                />
              </div>
              <AuthButton disabled={loading}>
                {loading ? 'Joining…' : 'Join Workspace'}
              </AuthButton>
            </form>
            <AuthFooter align="center">
              Want your own workspace?{' '}
              <AuthTextButton onClick={() => goTo('create')} disabled={loading}>
                Create one
              </AuthTextButton>
            </AuthFooter>
          </div>
        </div>
      </StepLayout>
    );
  }

  return (
    <StepLayout backdrop="spotlight">
      <div className="flex flex-col gap-[68px]">
        <AuthHeading
          align="center"
          title={
            <>
              Let&apos;s Get You Started <Emoji>🚀</Emoji>
            </>
          }
          subtitle="Create a new workspace or join your team"
        />
        <div className="flex flex-col items-center gap-[37px]">
          <div className="flex w-full flex-col gap-[22px]">
            <ChoiceCard
              title="Create a workspace"
              description="Start fresh and invite your team later."
              onClick={() => goTo('create')}
            />
            <ChoiceCard
              title="Join a workspace"
              description="Use the invite code from your admin."
              onClick={() => goTo('join')}
            />
          </div>
          {currentUser ? (
            <AuthFooter align="center">
              Signed in as <span className="break-all text-soft sm:break-normal sm:whitespace-nowrap">{currentUser.email}</span>
              <br />
              <AuthTextButton onClick={() => void signOutTo('/login')} disabled={loading}>
                Use another account
              </AuthTextButton>
            </AuthFooter>
          ) : null}
        </div>
      </div>
    </StepLayout>
  );

  function renderInvite() {
    if (previewLoading) {
      return (
        <p role="status" className="text-center text-[16px] text-sub">
          Loading your invitation…
        </p>
      );
    }

    if (inviteError || !invite) {
      return (
        <div className="flex flex-col gap-[68px]">
          <AuthHeading
            align="center"
            title={
              <>
                This Invite Isn&apos;t Available <Emoji>😕</Emoji>
              </>
            }
            subtitle={inviteError || 'This invitation could not be loaded.'}
          />
          <div className="flex flex-col items-center gap-[37px]">
            {currentUser ? (
              <AuthButton type="button" onClick={() => router.replace('/onboarding')}>
                Create or Join a Workspace
              </AuthButton>
            ) : (
              <AuthButtonLink href="/login">Go to Sign In</AuthButtonLink>
            )}
            <AuthFooter align="center">
              Ask your workspace admin to send you a new invitation.
            </AuthFooter>
          </div>
        </div>
      );
    }

    const joinLabel = `Join ${invite.organizationName}`;
    const invitedLine = (
      <>
        You&apos;ve been invited to join{' '}
        <span className="text-soft">{invite.organizationName}</span> as{' '}
        <span className="break-all text-soft sm:break-normal sm:whitespace-nowrap">{invite.email}</span>
      </>
    );

    if (!currentUser && invite.hasAccount) {
      return (
        <div className="flex flex-col gap-[68px]">
          <AuthHeading
            align="center"
            title={
              <>
                Welcome Back <Emoji>👋</Emoji>
              </>
            }
            subtitle={invitedLine}
          />
          <div className="flex flex-col items-center gap-[37px]">
            <AuthButtonLink href={loginHref}>Sign in</AuthButtonLink>
            <AuthFooter align="center">
              Sign in with this email to accept the invitation.
            </AuthFooter>
          </div>
        </div>
      );
    }

    if (!currentUser) {
      return (
        <div className="flex flex-col gap-[48px]">
          <AuthHeading
            align="center"
            title={
              <>
                Happy to See You here <Emoji>😄</Emoji>
              </>
            }
            subtitle="You Made a right Choice Buddy!"
          />
          <div className="flex flex-col items-center gap-[37px]">
            <form onSubmit={handleInviteSignup} noValidate className="flex w-full flex-col gap-[39px]">
              <div className="flex flex-col gap-[39px]">
                <AuthNotice tone="error">{formError}</AuthNotice>
                <AuthInput
                  label="Full name"
                  name="name"
                  autoComplete="name"
                  placeholder="Please enter your Full Name"
                  value={inviteeName}
                  onChange={(event) => setInviteeName(event.target.value)}
                  error={fieldErrors.name}
                  autoFocus
                />
                <PasswordInput
                  label="Password"
                  name="password"
                  autoComplete="new-password"
                  placeholder="Please create a Password"
                  value={inviteePassword}
                  onChange={(event) => setInviteePassword(event.target.value)}
                  error={fieldErrors.password}
                />
              </div>
              <AuthButton disabled={loading}>{loading ? 'Joining…' : joinLabel}</AuthButton>
            </form>
            <AuthFooter align="center">{invitedLine}</AuthFooter>
          </div>
        </div>
      );
    }

    if (!emailMatches) {
      return (
        <div className="flex flex-col gap-[68px]">
          <AuthHeading
            align="center"
            title={
              <>
                Wrong Account <Emoji>🤔</Emoji>
              </>
            }
            subtitle={
              <>
                This invite is for <span className="break-all text-soft sm:break-normal sm:whitespace-nowrap">{invite.email}</span>,
                but you&apos;re signed in as{' '}
                <span className="break-all text-soft sm:break-normal sm:whitespace-nowrap">{currentUser.email}</span>.
              </>
            }
          />
          <div className="flex flex-col items-center gap-[22px]">
            <AuthNotice tone="error">{formError}</AuthNotice>
            <AuthButton type="button" onClick={() => void signOutTo(loginHref)} disabled={loading}>
              Sign in as another user
            </AuthButton>
            <AuthFooter align="center">
              New here?{' '}
              <AuthTextButton onClick={() => void signOutTo(signupHref)} disabled={loading}>
                Create invited account
              </AuthTextButton>
            </AuthFooter>
          </div>
        </div>
      );
    }

    if (existingMembership) {
      return (
        <div className="flex flex-col gap-[68px]">
          <AuthHeading
            align="center"
            title={
              <>
                Already a member <Emoji>🙌</Emoji>
              </>
            }
            subtitle={
              <>
                You&apos;re already part of{' '}
                <span className="text-soft">{invite.organizationName}</span>
              </>
            }
          />
          <div className="flex flex-col items-center gap-[22px]">
            <AuthNotice tone="error">{formError}</AuthNotice>
            <AuthButton type="button" onClick={goToWorkspace} disabled={loading}>
              {loading ? 'Opening…' : 'Go to workspace'}
            </AuthButton>
          </div>
        </div>
      );
    }

    if (!currentUser.emailVerifiedAt) {
      return (
        <div className="flex flex-col gap-[68px]">
          <AuthHeading
            align="center"
            title={
              <>
                One More Step <Emoji>✋</Emoji>
              </>
            }
            subtitle={
              <>
                Verify <span className="break-all text-soft sm:break-normal sm:whitespace-nowrap">{currentUser.email}</span> before
                joining {invite.organizationName}
              </>
            }
          />
          <AuthButtonLink href={`/verify-email?from=${encodeURIComponent(inviteReturnPath)}`}>
            Verify email
          </AuthButtonLink>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-[68px]">
        <AuthHeading
          align="center"
          title={
            <>
              Happy to See You here <Emoji>😄</Emoji>
            </>
          }
          subtitle={invitedLine}
        />
        <div className="flex flex-col items-center gap-[22px]">
          <AuthNotice tone="error">{formError}</AuthNotice>
          <AuthButton
            type="button"
            onClick={() => void joinOrganization(inviteToken)}
            disabled={loading}
          >
            {loading ? 'Joining…' : joinLabel}
          </AuthButton>
        </div>
      </div>
    );
  }
}

function ChoiceCard({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center justify-between gap-4 rounded-[6px] border border-line px-[25px] py-[20px] text-left transition-colors hover:border-line-strong hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
    >
      <span className="flex flex-col gap-[6px]">
        <span className="text-[18px] leading-[normal] text-white">{title}</span>
        <span className="text-[14px] leading-[1.4] text-sub">{description}</span>
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/icon-chevron-down.svg"
        alt=""
        width={24}
        height={24}
        className="-rotate-90 opacity-60 transition-opacity group-hover:opacity-100"
      />
    </button>
  );
}
