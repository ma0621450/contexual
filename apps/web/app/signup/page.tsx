'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signupFormSchema } from '@/lib/validations/auth';
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
import { getSafeInternalReturnPath } from '@/lib/auth/return-path';
import { collectFieldErrors } from '@/lib/auth/form';

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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setFormError('');
    setFieldErrors({});

    const parsed = signupFormSchema.safeParse({
      name,
      email,
      password,
      confirmPassword,
    });
    if (!parsed.success) {
      setFieldErrors(collectFieldErrors(parsed.error));
      return;
    }

    setLoading(true);
    const { confirmPassword: _confirm, ...payload } = parsed.data;
    void _confirm;
    const result = await apiFetch<{ redirectTo?: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!result.ok) {
      setLoading(false);
      if (result.status === 409) {
        setFieldErrors({ email: result.error });
      } else {
        setFormError(result.error);
      }
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
    <AuthSplitLayout image="signup">
      <div className="flex flex-col gap-[68px]">
        <AuthHeading
          title={
            <>
              Hello <Emoji>😄</Emoji> Glad to see You here
            </>
          }
          subtitle="Please write all the required signup details"
        />

        <div className="flex flex-col gap-[37px]">
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-[39px]">
            <div className="flex flex-col gap-[22px]">
              <AuthNotice tone="error">{formError}</AuthNotice>
              <AuthInput
                label="Full name"
                name="name"
                autoComplete="name"
                placeholder="Please enter your Full Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                error={fieldErrors.name}
              />
              <AuthInput
                label="Work Email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Please enter your email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                error={fieldErrors.email}
                readOnly={isInviteSignup}
                hint={
                  isInviteSignup
                    ? 'This invitation is tied to this email address.'
                    : undefined
                }
              />
              <PasswordInput
                label="Password"
                name="password"
                autoComplete="new-password"
                placeholder="Please enter your Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={fieldErrors.password}
              />
              <PasswordInput
                label="Confirm password"
                name="confirmPassword"
                autoComplete="new-password"
                placeholder="Please enter your Password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                error={fieldErrors.confirmPassword}
              />
            </div>
            <AuthButton disabled={loading}>
              {loading ? 'Creating Account…' : 'Sign Up'}
            </AuthButton>
          </form>

          <AuthFooter>
            Already have an account? <AuthTextLink href={loginHref}>Sign In</AuthTextLink>
          </AuthFooter>
        </div>
      </div>
    </AuthSplitLayout>
  );
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}
