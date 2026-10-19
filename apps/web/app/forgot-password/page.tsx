'use client';

import { useState } from 'react';
import { forgotPasswordSchema } from '@/lib/validations/auth';
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
} from '@/components/auth/AuthControls';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setFieldError('');
    setFormError('');

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Enter a valid email address');
      return;
    }

    setLoading(true);
    const result = await apiFetch<{ message?: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    });
    setLoading(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setSentTo(parsed.data.email);
  }

  if (sentTo) {
    return (
      <AuthSplitLayout image="signin">
        <div className="flex flex-col gap-[68px]">
          <AuthHeading
            title={
              <>
                Check Your Inbox <Emoji>📬</Emoji>
              </>
            }
            subtitle={
              <>
                If an account exists for <span className="text-soft">{sentTo}</span>, we sent a
                link to reset your password. It expires in 1 hour.
              </>
            }
          />
          <div className="flex flex-col gap-[37px]">
            <AuthButton type="button" onClick={() => setSentTo('')}>
              Use a Different Email
            </AuthButton>
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
          title="Forgot Your Password?"
          subtitle="Enter your email and we will send you a reset link"
        />
        <div className="flex flex-col gap-[37px]">
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-[39px]">
            <div className="flex flex-col gap-[22px]">
              <AuthNotice tone="error">{formError}</AuthNotice>
              <AuthInput
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Please enter your email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                error={fieldError}
              />
            </div>
            <AuthButton disabled={loading}>
              {loading ? 'Sending…' : 'Send Reset Link'}
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
