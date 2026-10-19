'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { resetPasswordSchema } from '@/lib/validations/auth';
import { apiFetch } from '@/lib/api/client';
import { AuthSplitLayout } from '@/components/auth/AuthShell';
import {
  AuthButtonLink,
  AuthButton,
  AuthFooter,
  AuthHeading,
  AuthNotice,
  AuthTextLink,
  PasswordInput,
} from '@/components/auth/AuthControls';

export function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get('token') ?? '';

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

    const parsed = resetPasswordSchema.safeParse({
      token: tokenFromUrl,
      password,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue?.path[0] === 'password') {
        setFieldErrors({ password: issue.message });
      } else {
        setFormError(issue?.message ?? 'Invalid input');
      }
      return;
    }
    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }

    setLoading(true);
    const result = await apiFetch('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    });
    setLoading(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    router.push('/login?passwordChanged=1');
    router.refresh();
  }

  if (!tokenFromUrl) {
    return (
      <AuthSplitLayout image="signin">
        <div className="flex flex-col gap-[68px]">
          <AuthHeading
            title="This Link Isn’t Valid"
            subtitle="The password reset link is missing or incomplete. Open the link from your email, or request a new one."
          />
          <div className="flex flex-col gap-[37px]">
            <AuthButtonLink href="/forgot-password">Request a New Link</AuthButtonLink>
            <AuthFooter>
              Remember your password? <AuthTextLink href="/login">Sign In</AuthTextLink>
            </AuthFooter>
          </div>
        </div>
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout image="signin">
      <div className="flex flex-col gap-[68px]">
        <AuthHeading
          title="Set a New Password"
          subtitle="Choose a new password for your account"
        />
        <div className="flex flex-col gap-[37px]">
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-[39px]">
            <div className="flex flex-col gap-[22px]">
              <AuthNotice tone="error">
                {formError ? (
                  <>
                    {formError}.{' '}
                    <AuthTextLink href="/forgot-password">Request a new link</AuthTextLink>
                  </>
                ) : null}
              </AuthNotice>
              <PasswordInput
                label="New password"
                name="password"
                autoComplete="new-password"
                placeholder="Please enter your new Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={fieldErrors.password}
              />
              <PasswordInput
                label="Confirm password"
                name="confirmPassword"
                autoComplete="new-password"
                placeholder="Please confirm your new Password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                error={fieldErrors.confirmPassword}
              />
            </div>
            <AuthButton disabled={loading}>
              {loading ? 'Updating…' : 'Update Password'}
            </AuthButton>
          </form>
          <AuthFooter>
            Remember your password? <AuthTextLink href="/login">Sign In</AuthTextLink>
          </AuthFooter>
        </div>
      </div>
    </AuthSplitLayout>
  );
}
