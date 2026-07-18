'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loginSchema } from '@/lib/validations/auth';
import { apiFetch } from '@/lib/api/client';
import { AuthError, AuthLayout, AuthLink } from '@/components/auth/AuthLayout';
import { FormField } from '@/components/auth/FormField';
import { Button } from '@/components/ui/button';
import { getSafeInternalReturnPath } from '@/lib/auth/return-path';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(() => searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const passwordChanged = searchParams.get('passwordChanged') === '1';
  const returnPath = getSafeInternalReturnPath(searchParams.get('from'));
  const signupParams = new URLSearchParams();
  if (returnPath) signupParams.set('from', returnPath);
  if (searchParams.get('email')) signupParams.set('email', email);
  const signupHref = signupParams.size
    ? `/signup?${signupParams.toString()}`
    : '/signup';

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError('');
    setFieldErrors({});

    const parsed = loginSchema.safeParse({ email, password });
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
    const result = await apiFetch<{ redirectTo?: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    });
    setLoading(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    router.push(returnPath ?? result.data.redirectTo ?? '/dashboard');
    router.refresh();
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your Contexual workspace"
      footer={
        <p>
          Don&apos;t have an account?{' '}
          <AuthLink href={signupHref}>Sign up</AuthLink>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <AuthError>{formError}</AuthError>
        {passwordChanged ? (
          <p className="rounded-lg border border-border bg-accent px-3 py-2 text-sm text-accent-foreground">
            Password changed. Sign in again with your new password.
          </p>
        ) : null}

        <FormField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fieldErrors.email}
        />

        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
          labelAction={
            <AuthLink href="/forgot-password">Forgot password?</AuthLink>
          }
        />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
