'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loginSchema } from '@/lib/validations/auth';
import { apiFetch } from '@/lib/api/client';
import { AuthSplitLayout } from '@/components/auth/AuthShell';
import {
  AuthButton,
  AuthFooter,
  AuthHeading,
  AuthInput,
  AuthNotice,
  AuthTextLink,
  Emoji,
  PasswordInput,
} from '@/components/auth/AuthControls';
import { SuccessScreen } from '@/components/auth/TransitionScreen';
import { getSafeInternalReturnPath } from '@/lib/auth/return-path';
import { collectFieldErrors, firstName } from '@/lib/auth/form';

const WELCOME_SCREEN_MS = 1400;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(() => searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
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
    if (loading) return;
    setFormError('');
    setFieldErrors({});

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldErrors(collectFieldErrors(parsed.error));
      return;
    }

    setLoading(true);
    const result = await apiFetch<{
      redirectTo?: string;
      user?: { name: string };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    });

    if (!result.ok) {
      setLoading(false);
      if (result.status === 401) {
        setFieldErrors({ password: 'Incorrect email or password' });
      } else {
        setFormError(result.error);
      }
      return;
    }

    const destination = returnPath ?? result.data.redirectTo ?? '/dashboard';
    if (destination.startsWith('/dashboard')) {
      setWelcomeName(firstName(result.data.user?.name));
      await new Promise((resolve) => setTimeout(resolve, WELCOME_SCREEN_MS));
    }
    router.push(destination);
    router.refresh();
  }

  if (welcomeName !== null) {
    return (
      <SuccessScreen>
        Success <Emoji>🥳</Emoji> Welcome Back {welcomeName}....
      </SuccessScreen>
    );
  }

  return (
    <AuthSplitLayout image="signin">
      <div className="flex flex-col gap-[68px]">
        <AuthHeading
          title="Sign In to Your Account"
          subtitle="Please write all the required sign in details required"
        />

        <div className="flex flex-col gap-[37px]">
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-[39px]">
            <div className="flex flex-col gap-[22px]">
              {passwordChanged ? (
                <AuthNotice>Password changed. Sign in again with your new password.</AuthNotice>
              ) : null}
              <AuthNotice tone="error">{formError}</AuthNotice>
              <AuthInput
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Please enter your email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                error={fieldErrors.email}
              />
              <PasswordInput
                label="Password"
                name="password"
                autoComplete="current-password"
                placeholder="Please enter your Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={fieldErrors.password}
              />
              <AuthTextLink
                href="/forgot-password"
                className="self-start text-[16px] text-sub underline decoration-from-font hover:text-soft"
              >
                Forgot Password
              </AuthTextLink>
            </div>
            <AuthButton disabled={loading}>{loading ? 'Signing In…' : 'Sign In'}</AuthButton>
          </form>

          <AuthFooter>
            Don&apos;t have an account? <AuthTextLink href={signupHref}>Sign Up</AuthTextLink>
          </AuthFooter>
        </div>
      </div>
    </AuthSplitLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
