'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createOrganizationSchema,
  joinOrganizationSchema,
} from '@/lib/validations/auth';
import { ArrowRightIcon, BuildingIcon, UserPlusIcon } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import { AuthError, AuthLayout } from '@/components/auth/AuthLayout';
import { FormField } from '@/components/auth/FormField';
import { StepIndicator } from '@/components/auth/StepIndicator';
import { Button } from '@/components/ui/button';

type OnboardingStep = 'choice' | 'create' | 'join' | 'invite-confirm';
const ORG_NAME_LIMIT = 100;

function getOrganizationSlugPreview(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return slug || 'your-workspace';
}

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite') ?? '';
  const createRequested = searchParams.get('action') === 'create';

  const [step, setStep] = useState<OnboardingStep>(
    createRequested ? 'create' : 'choice',
  );
  const [currentStepNumber, setCurrentStepNumber] = useState(
    createRequested ? 2 : 1,
  );
  const [organizationName, setOrganizationName] = useState('');
  const [inviteOrgName, setInviteOrgName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteCode, setInviteCode] = useState(inviteToken);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(Boolean(inviteToken));

  useEffect(() => {
    if (!inviteToken) return;

    async function loadInvitePreview() {
      setPreviewLoading(true);
      try {
        const result = await apiFetch<{
          organizationName?: string;
          email?: string;
        }>(
          `/onboarding/invite-preview?token=${encodeURIComponent(inviteToken)}`,
        );

        if (!result.ok) {
          setFormError(result.error);
          setStep('choice');
          setCurrentStepNumber(1);
          return;
        }

        setInviteOrgName(result.data.organizationName ?? '');
        setInviteEmail(result.data.email ?? '');
        setInviteCode(inviteToken);
        setStep('invite-confirm');
        setCurrentStepNumber(1);
      } catch {
        setFormError('Unable to load invite details');
        setStep('choice');
        setCurrentStepNumber(1);
      } finally {
        setPreviewLoading(false);
      }
    }

    void loadInvitePreview();
  }, [inviteToken]);

  function goToChoice() {
    setFormError('');
    setFieldErrors({});
    setStep('choice');
    setCurrentStepNumber(1);
  }

  function selectCreate() {
    setStep('create');
    setCurrentStepNumber(2);
  }

  function selectJoin() {
    setStep('join');
    setCurrentStepNumber(2);
  }

  async function handleCreateOrganization(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;

    setFormError('');
    setFieldErrors({});

    const parsed = createOrganizationSchema.safeParse({ name: organizationName });
    if (!parsed.success) {
      setFieldErrors({ name: parsed.error.issues[0]?.message ?? 'Invalid name' });
      return;
    }

    setLoading(true);
    try {
      const result = await apiFetch<{ redirectTo?: string }>(
        '/onboarding/create-organization',
        {
          method: 'POST',
          body: JSON.stringify(parsed.data),
        },
      );

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      router.push(result.data.redirectTo ?? '/dashboard');
      router.refresh();
    } catch {
      setFormError('Unable to create organization. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinOrganization(token: string) {
    if (loading) return;

    setFormError('');
    setFieldErrors({});

    const parsed = joinOrganizationSchema.safeParse({ token });
    if (!parsed.success) {
      setFieldErrors({ token: parsed.error.issues[0]?.message ?? 'Invalid token' });
      return;
    }

    setLoading(true);
    try {
      const result = await apiFetch<{ redirectTo?: string }>(
        '/onboarding/join-organization',
        {
          method: 'POST',
          body: JSON.stringify(parsed.data),
        },
      );

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      router.push(result.data.redirectTo ?? '/dashboard');
      router.refresh();
    } catch {
      setFormError('Unable to join organization. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinSubmit(event: React.FormEvent) {
    event.preventDefault();
    await handleJoinOrganization(inviteCode);
  }

  async function switchAccount() {
    if (loading) return;
    setLoading(true);
    setFormError('');

    const result = await apiFetch<{ ok: true }>('/auth/logout', {
      method: 'POST',
    }).catch(() => ({ ok: false as const, error: 'Unable to reach the server' }));

    if (!result.ok) {
      setFormError('Unable to sign out. Check your connection and try again.');
      setLoading(false);
      return;
    }

    const returnTo = `/onboarding?invite=${encodeURIComponent(inviteCode)}`;
    router.replace(`/login?from=${encodeURIComponent(returnTo)}`);
    router.refresh();
  }

  const subtitle =
    step === 'invite-confirm'
      ? 'Review your invitation below'
      : step === 'create'
        ? 'Name your new workspace'
        : step === 'join'
          ? 'Enter your invite code to join a team'
          : 'Set up your team workspace to get started';

  return (
    <AuthLayout title="Welcome to Contexual" subtitle={subtitle} wide>
      <StepIndicator totalSteps={2} currentStep={currentStepNumber} />

      <div className="mb-5">
        <AuthError>{formError}</AuthError>
      </div>

      {previewLoading ? (
        <p className="text-center text-sm text-muted-foreground">
          Loading invite…
        </p>
      ) : (
        <div key={step} className="animate-fade-slide-in">
          {step === 'choice' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={selectCreate}
                className="group rounded-xl border border-border bg-card p-6 text-left transition-colors hover:border-primary hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring/30"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <BuildingIcon className="size-5" />
                </span>
                <h2 className="mt-4 text-base font-semibold">
                  Create an organization
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Start a new workspace and invite your team later.
                </p>
              </button>

              <button
                type="button"
                onClick={selectJoin}
                className="group rounded-xl border border-border bg-card p-6 text-left transition-colors hover:border-primary hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring/30"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <UserPlusIcon className="size-5" />
                </span>
                <h2 className="mt-4 text-base font-semibold">
                  Join an organization
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Have an invite code? Paste it on the next step.
                </p>
              </button>
            </div>
          ) : null}

          {step === 'create' ? (
            <form onSubmit={handleCreateOrganization} className="space-y-5">
              <FormField
                label="Organization name"
                name="name"
                value={organizationName}
                onChange={(event) => {
                  setOrganizationName(event.target.value);
                  setFieldErrors((prev) => ({ ...prev, name: '' }));
                }}
                error={fieldErrors.name}
                placeholder="Acme Inc."
                maxLength={ORG_NAME_LIMIT}
                autoFocus
              />
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  Workspace URL preview:{' '}
                  <span className="font-medium text-foreground">
                    {getOrganizationSlugPreview(organizationName)}
                  </span>
                </p>
                <p>
                  {organizationName.trim().length}/{ORG_NAME_LIMIT} characters
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={goToChoice}
                  disabled={loading}
                >
                  Back
                </Button>
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? 'Creating…' : 'Create organization'}
                </Button>
              </div>
            </form>
          ) : null}

          {step === 'join' ? (
            <form onSubmit={handleJoinSubmit} className="space-y-5">
              <FormField
                label="Invite code"
                name="inviteCode"
                value={inviteCode}
                onChange={(event) => {
                  setInviteCode(event.target.value);
                  setFieldErrors((prev) => ({ ...prev, token: '' }));
                }}
                error={fieldErrors.token}
                placeholder="Paste your invite token"
              />

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={goToChoice}
                  disabled={loading}
                >
                  Back
                </Button>
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? 'Joining…' : 'Join organization'}
                </Button>
              </div>
            </form>
          ) : null}

          {step === 'invite-confirm' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-primary/40 bg-accent p-6">
                <p className="text-sm text-muted-foreground">
                  You&apos;ve been invited to join
                </p>
                <h2 className="mt-1 text-xl font-semibold">{inviteOrgName}</h2>
                {inviteEmail ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Invitation for {inviteEmail}
                  </p>
                ) : null}
              </div>

              <Button
                type="button"
                className="w-full"
                onClick={() => handleJoinOrganization(inviteCode)}
                disabled={loading}
              >
                {loading ? 'Joining…' : 'Accept and join'}
                <ArrowRightIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={switchAccount}
                disabled={loading}
              >
                Not your email? Sign in with another account
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </AuthLayout>
  );
}
