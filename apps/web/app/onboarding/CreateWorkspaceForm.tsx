'use client';

import { useEffect, useState } from 'react';
import {
  createOrganizationSchema,
  ORGANIZATION_TYPES,
  TEAM_SIZES,
  workspaceSlugSchema,
  type OrganizationTypeValue,
  type TeamSizeValue,
} from '@/lib/validations/auth';
import { apiFetch, type ApiResult } from '@/lib/api/client';
import {
  AuthButton,
  AuthFooter,
  AuthHeading,
  AuthInput,
  AuthNotice,
  AuthSelect,
  AuthTextButton,
  Emoji,
} from '@/components/auth/AuthControls';
import { collectFieldErrors } from '@/lib/auth/form';

const ORG_NAME_LIMIT = 100;
const SLUG_CHECK_DELAY_MS = 400;

type SlugStatus =
  | { state: 'idle' }
  | { state: 'checking'; slug: string }
  | { state: 'available'; slug: string }
  | { state: 'unavailable'; slug: string; message: string };

type SlugCheck =
  | { slug: string; failed: true }
  | { slug: string; available: true }
  | { slug: string; available: false; message: string };

type SlugAvailability = {
  slug: string;
  available: boolean;
  message?: string;
};

export type CreateWorkspaceInput = {
  name: string;
  slug: string;
  organizationType: OrganizationTypeValue;
  teamSize?: TeamSizeValue;
};

export function CreateWorkspaceForm({
  onCreate,
  onSignIn,
  onJoinInstead,
  busy,
}: {
  onCreate: (input: CreateWorkspaceInput) => Promise<ApiResult<unknown>>;
  onSignIn: () => void;
  onJoinInstead: () => void;
  busy: boolean;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [organizationType, setOrganizationType] = useState<OrganizationTypeValue | ''>('');
  const [teamSize, setTeamSize] = useState<TeamSizeValue | ''>('');
  const [lastCheck, setLastCheck] = useState<SlugCheck | null>(null);
  const [generating, setGenerating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const slugIsWellFormed = workspaceSlugSchema.safeParse(slug).success;

  useEffect(() => {
    if (!slugIsWellFormed) return;

    let active = true;
    const timer = setTimeout(async () => {
      const result = await apiFetch<SlugAvailability>(
        `/onboarding/slug-availability?slug=${encodeURIComponent(slug)}`,
      );
      if (!active) return;
      setLastCheck(
        !result.ok
          ? { slug, failed: true }
          : result.data.available
            ? { slug, available: true }
            : {
                slug,
                available: false,
                message: result.data.message ?? 'This workspace URL is not available',
              },
      );
    }, SLUG_CHECK_DELAY_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [slug, slugIsWellFormed]);

  const slugStatus: SlugStatus = !slugIsWellFormed
    ? { state: 'idle' }
    : lastCheck?.slug !== slug
      ? { state: 'checking', slug }
      : 'failed' in lastCheck
        ? { state: 'idle' }
        : lastCheck.available
          ? { state: 'available', slug }
          : { state: 'unavailable', slug, message: lastCheck.message };

  function clearFieldError(field: string) {
    setFieldErrors((previous) => {
      if (!previous[field]) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
  }

  async function generateSlug() {
    if (generating) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setFieldErrors((previous) => ({
        ...previous,
        name: 'Enter your organization name to generate a URL',
      }));
      return;
    }
    setGenerating(true);
    const result = await apiFetch<{ slug: string }>(
      `/onboarding/slug-suggestion?name=${encodeURIComponent(trimmed)}`,
    );
    setGenerating(false);
    if (!result.ok) {
      setFieldErrors((previous) => ({ ...previous, slug: result.error }));
      return;
    }
    clearFieldError('slug');
    setSlug(result.data.slug);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setFormError('');

    const parsed = createOrganizationSchema.safeParse({
      name,
      slug,
      organizationType: organizationType || undefined,
      teamSize: teamSize || undefined,
    });
    if (!parsed.success) {
      setFieldErrors(collectFieldErrors(parsed.error));
      return;
    }
    if (slugStatus.state === 'unavailable' && slugStatus.slug === parsed.data.slug) {
      setFieldErrors({ slug: slugStatus.message });
      return;
    }
    setFieldErrors({});

    const result = await onCreate(parsed.data);
    if (result.ok) return;
    if (result.status === 409 || /workspace url/i.test(result.error)) {
      setFieldErrors({ slug: result.error });
    } else {
      setFormError(result.error);
    }
  }

  const slugError =
    fieldErrors.slug ??
    (slugStatus.state === 'unavailable' && slugStatus.slug === slug
      ? slugStatus.message
      : undefined);
  const slugHint =
    slugStatus.state === 'checking'
      ? 'Checking availability…'
      : slugStatus.state === 'available' && slugStatus.slug === slug
        ? `${slug} is available`
        : undefined;

  return (
    <div className="flex flex-col gap-[68px]">
      <AuthHeading
        align="center"
        title={
          <>
            Let&apos;s Create Your Workspace <Emoji>👊</Emoji>
          </>
        }
        subtitle="Please write all the required details"
      />

      <div className="flex flex-col items-center gap-[37px]">
        <form onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-[39px]">
          <div className="flex flex-col gap-[22px]">
            <AuthNotice tone="error">{formError}</AuthNotice>
            <AuthInput
              label="Organization Name"
              name="organizationName"
              autoComplete="organization"
              placeholder="Please enter your Organization Name"
              maxLength={ORG_NAME_LIMIT}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                clearFieldError('name');
              }}
              error={fieldErrors.name}
              autoFocus
            />
            <AuthInput
              label="Workspace URL"
              name="slug"
              autoComplete="off"
              spellCheck={false}
              placeholder="Click on the generate icon for a link"
              maxLength={48}
              value={slug}
              onChange={(event) => {
                setSlug(event.target.value.toLowerCase().replace(/\s+/g, '-'));
                clearFieldError('slug');
              }}
              error={slugError}
              hint={slugHint}
              trailing={
                <button
                  type="button"
                  onClick={generateSlug}
                  disabled={generating}
                  aria-label="Generate workspace URL"
                  title="Generate from organization name"
                  className="shrink-0 rounded-sm opacity-90 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:animate-pulse"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand/icon-generate.svg" alt="" width={24} height={24} />
                </button>
              }
            />
            <AuthSelect
              label="Organization Type"
              name="organizationType"
              placeholder="Design Agency"
              options={[...ORGANIZATION_TYPES]}
              value={organizationType}
              onValueChange={(value) => {
                setOrganizationType(value);
                clearFieldError('organizationType');
              }}
              error={fieldErrors.organizationType}
            />
            <AuthSelect
              label="Team Size"
              name="teamSize"
              placeholder="Optional (Just me / 2–10 / 11–25 / 26–100 / 100+)"
              options={[...TEAM_SIZES]}
              value={teamSize}
              onValueChange={setTeamSize}
              showChevron={false}
            />
          </div>
          <AuthButton disabled={busy}>{busy ? 'Creating…' : 'Get Started'}</AuthButton>
        </form>

        <div className="flex flex-col items-center gap-[10px]">
          <AuthFooter align="center">
            Already have an account?{' '}
            <AuthTextButton onClick={onSignIn} disabled={busy}>
              Sign In
            </AuthTextButton>
          </AuthFooter>
          <AuthFooter align="center">
            Have an invite code?{' '}
            <AuthTextButton onClick={onJoinInstead} disabled={busy}>
              Join a workspace
            </AuthTextButton>
          </AuthFooter>
        </div>
      </div>
    </div>
  );
}
