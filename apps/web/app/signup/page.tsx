'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { registerSchema } from '@/lib/validations/auth';
import { apiFetch } from '@/lib/api/client';
import { AuthError, AuthLayout, AuthLink } from '@/components/auth/AuthLayout';
import { FormField } from '@/components/auth/FormField';
import { Button } from '@/components/ui/button';
import { getSafeInternalReturnPath } from '@/lib/auth/return-path';

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnPath = getSafeInternalReturnPath(searchParams.get('from'));
  const queryEmail = searchParams.get('email') ?? '';
  const isInviteSignup =
    Boolean(returnPath?.startsWith('/onboarding?')) &&
    Boolean(
      new URLSearchParams(returnPath?.split('?')[1] ?? '').get('invite'),
    ) &&
    Boolean(queryEmail);
  const [name, setName] = useState('');
  const [email, setEmail] = useState(queryEmail);
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError('');
    setFieldErrors({});

    const parsed = registerSchema.safeParse({ name, email, password });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string') {
          errors[key] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    const result = await apiFetch<{ redirectTo?: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    });
    setLoading(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    const verifyHref = returnPath
      ? `/verify-email?from=${encodeURIComponent(returnPath)}`
      : (result.data.redirectTo ?? '/verify-email');
    router.push(verifyHref);
    router.refresh();
  }

  const loginParams = new URLSearchParams();
  if (returnPath) loginParams.set('from', returnPath);
  if (queryEmail) loginParams.set('email', queryEmail);
  const loginHref = loginParams.size
    ? `/login?${loginParams.toString()}`
    : '/login';

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Get started with Contexual — set up your workspace next"
      footer={
        <p>
          Already have an account? <AuthLink href={loginHref}>Sign in</AuthLink>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <AuthError>{formError}</AuthError>

        <FormField
          label="Name"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldErrors.name}
        />

        <FormField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fieldErrors.email}
          readOnly={isInviteSignup}
        />
        {isInviteSignup ? (
          <p className="-mt-3 text-xs text-muted-foreground">
            This invitation is tied to this email address.
          </p>
        ) : null}

        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
        />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}
