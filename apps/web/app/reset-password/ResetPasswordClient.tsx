'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { resetPasswordSchema } from '@/lib/validations/auth';
import { apiFetch } from '@/lib/api/client';
import { AuthError, AuthLayout, AuthLink } from '@/components/auth/AuthLayout';
import { FormField } from '@/components/auth/FormField';
import { Button } from '@/components/ui/button';

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
    setFormError('');
    setFieldErrors({});

    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }

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

    router.push('/login');
    router.refresh();
  }

  if (!tokenFromUrl) {
    return (
      <AuthLayout
        title="Invalid reset link"
        subtitle="This password reset link is missing or malformed."
        footer={
          <p>
            <AuthLink href="/forgot-password">Request a new link</AuthLink>
          </p>
        }
      >
        <p className="text-sm text-muted-foreground">
          Open the link from your email, or request a new reset link.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Enter a new password for your account"
      footer={
        <p>
          Remember your password? <AuthLink href="/login">Sign in</AuthLink>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <AuthError>{formError}</AuthError>

        <FormField
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
        />

        <FormField
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          error={fieldErrors.confirmPassword}
        />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Updating…' : 'Update password'}
        </Button>
      </form>
    </AuthLayout>
  );
}
