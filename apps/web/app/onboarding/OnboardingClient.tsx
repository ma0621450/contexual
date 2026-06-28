'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createOrganizationSchema,
  joinOrganizationSchema,
} from '@/lib/validations/auth';
import { apiFetch } from '@/lib/api/client';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { FormField } from '@/components/auth/FormField';
import { StepIndicator } from '@/components/auth/StepIndicator';

type OnboardingStep = 'choice' | 'create' | 'join' | 'invite-confirm';

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite') ?? '';

  const [step, setStep] = useState<OnboardingStep>('choice');
  const [currentStepNumber, setCurrentStepNumber] = useState(1);
  const [organizationName, setOrganizationName] = useState('');
  const [inviteOrgName, setInviteOrgName] = useState('');
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
      const result = await apiFetch<{ organizationName?: string }>(
        `/onboarding/invite-preview?token=${encodeURIComponent(inviteToken)}`,
      );

      if (!result.ok) {
        setFormError(result.error);
          setStep('choice');
          setCurrentStepNumber(1);
          return;
        }

        setInviteOrgName(result.data.organizationName ?? '');
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
    setFormError('');
    setFieldErrors({});

    const parsed = createOrganizationSchema.safeParse({ name: organizationName });
    if (!parsed.success) {
      setFieldErrors({ name: parsed.error.issues[0]?.message ?? 'Invalid name' });
      return;
    }

    setLoading(true);
    const result = await apiFetch<{ redirectTo?: string }>(
      '/onboarding/create-organization',
      {
        method: 'POST',
        body: JSON.stringify(parsed.data),
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

  async function handleJoinOrganization(token: string) {
    setFormError('');
    setFieldErrors({});

    const parsed = joinOrganizationSchema.safeParse({ token });
    if (!parsed.success) {
      setFieldErrors({ token: parsed.error.issues[0]?.message ?? 'Invalid token' });
      return;
    }

    setLoading(true);
    const result = await apiFetch<{ redirectTo?: string }>(
      '/onboarding/join-organization',
      {
        method: 'POST',
        body: JSON.stringify(parsed.data),
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

  async function handleJoinSubmit(event: React.FormEvent) {
    event.preventDefault();
    await handleJoinOrganization(inviteCode);
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

      {formError ? (
        <p className="mb-5 rounded-lg border border-semantic-error/20 bg-semantic-error/5 px-3 py-2 text-sm text-semantic-error">
          {formError}
        </p>
      ) : null}

      {previewLoading ? (
        <p className="text-center text-sm text-text-muted">Loading invite...</p>
      ) : (
        <div key={step} className="animate-fade-slide-in">
          {step === 'choice' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={selectCreate}
                className="rounded-xl border border-border bg-surface-card p-6 text-left transition-colors hover:border-brand-primary hover:bg-brand-tint focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              >
                <h2 className="text-base font-semibold text-text-primary">
                  Create an organization
                </h2>
                <p className="mt-2 text-sm text-text-muted">
                  Start a new workspace and invite your team later.
                </p>
              </button>

              <button
                type="button"
                onClick={selectJoin}
                className="rounded-xl border border-border bg-surface-card p-6 text-left transition-colors hover:border-brand-primary hover:bg-brand-tint focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              >
                <h2 className="text-base font-semibold text-text-primary">
                  Join an organization
                </h2>
                <p className="mt-2 text-sm text-text-muted">
                  Have an invite code? Paste it on the next step.
                </p>
              </button>
            </div>
          ) : null}

          {step === 'create' ? (
            <form onSubmit={handleCreateOrganization} className="space-y-5">
              <FormField
                label="Organization name"
                name="organizationName"
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                error={fieldErrors.name}
                placeholder="Acme Inc."
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={goToChoice}
                  className="inline-flex flex-1 items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-brand-tint/40"
                >
                  Back
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={loading}>
                  {loading ? 'Creating...' : 'Create organization'}
                </button>
              </div>
            </form>
          ) : null}

          {step === 'join' ? (
            <form onSubmit={handleJoinSubmit} className="space-y-5">
              <FormField
                label="Invite code"
                name="inviteCode"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                error={fieldErrors.token}
                placeholder="Paste your invite token"
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={goToChoice}
                  className="inline-flex flex-1 items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-brand-tint/40"
                >
                  Back
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={loading}>
                  {loading ? 'Joining...' : 'Join organization'}
                </button>
              </div>
            </form>
          ) : null}

          {step === 'invite-confirm' ? (
            <div className="space-y-6">
              <div className="rounded-xl border border-brand-primary bg-brand-tint p-6">
                <p className="text-sm text-text-muted">You&apos;ve been invited to join</p>
                <h2 className="mt-1 text-xl font-semibold text-text-primary">
                  {inviteOrgName}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => handleJoinOrganization(inviteCode)}
                className="btn-primary"
                disabled={loading}
              >
                {loading ? 'Joining...' : 'Accept and join'}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </AuthLayout>
  );
}
